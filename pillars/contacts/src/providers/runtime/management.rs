use super::{ProviderError, ProviderRuntime};
use crate::providers::carddav::{credential::CardDavCredential, CardDavAdapter};
use crate::providers::credentials::SecretBytes;
use crate::providers::google::oauth::AuthorizationLocation;
use crate::providers::google::{people, session::retry};
use crate::providers::human_auth::HumanIdentity;
use crate::providers::oauth_state::{begin_authorization, consume_authorization};
use crate::providers::store::{self, AccountEpoch};
use crate::sources::model::{SourceAccount, SourceAccountInput};
use crate::sources::repo::create_or_get_account;
use sqlx::SqlitePool;

impl ProviderRuntime {
    /// Begin browser authorization for an existing Google account, or a new
    /// provisional account whose real subject is bound only after code exchange.
    pub async fn begin_google(
        &self,
        pool: &SqlitePool,
        human: &HumanIdentity,
        account_id: Option<&str>,
        label: Option<String>,
        now: i64,
    ) -> Result<AuthorizationLocation, ProviderError> {
        let config = self.google.as_ref().ok_or(ProviderError::Disabled)?;
        let account = match account_id {
            Some(id) => account(pool, id, "google").await?,
            None => create_or_get_account(
                pool,
                &SourceAccountInput {
                    provider: "google".to_string(),
                    account_key: format!("pending:{}", uuid::Uuid::new_v4()),
                    label,
                },
            )
            .await
            .map_err(|_| ProviderError::Storage)?,
        };
        let epoch = store::prepare_account(pool, human, &account.id).await?;
        let attempt =
            begin_authorization(pool, &self.cipher, human, &account.id, epoch, now).await?;
        config
            .authorization_location(&attempt.state, &attempt.pkce_challenge)
            .map_err(Into::into)
    }

    /// Complete a one-use human-bound authorization, validate the actual People
    /// subject, then install the refresh token using the initiating epoch fence.
    pub async fn finish_google(
        &self,
        pool: &SqlitePool,
        human: &HumanIdentity,
        state: &SecretBytes,
        code: &SecretBytes,
        now: i64,
    ) -> Result<String, ProviderError> {
        let config = self.google.as_ref().ok_or(ProviderError::Disabled)?;
        let consumed = consume_authorization(pool, &self.cipher, human, state, now).await?;
        let previous = match store::load_credential(pool, &self.cipher, &consumed.account_id).await
        {
            Ok(credential) => Some(credential),
            Err(store::ProviderStoreError::StaleAccount) => None,
            Err(error) => return Err(error.into()),
        };
        let tokens = retry(&self.delay, || {
            config.exchange_code(
                &self.transport,
                &consumed,
                code,
                previous.as_ref().map(|credential| &credential.secret),
                now.max(0) as u64,
            )
        })
        .await?;
        let subject = retry(&self.delay, || {
            people::account_key(&self.transport, &tokens.access_token)
        })
        .await?;
        bind_google_subject(pool, &consumed.account_id, consumed.epoch, &subject).await?;
        store::install_credential(
            pool,
            &self.cipher,
            human,
            &consumed.account_id,
            consumed.epoch,
            &tokens.refresh_token,
        )
        .await?;
        Ok(consumed.account_id)
    }

    /// Verify the actual CardDAV principal before installing app-password material.
    /// A reconnect to another principal is rejected without changing the account.
    pub async fn connect_icloud(
        &self,
        pool: &SqlitePool,
        human: &HumanIdentity,
        account_id: Option<&str>,
        credential: &CardDavCredential,
        label: Option<String>,
    ) -> Result<String, ProviderError> {
        let old = match account_id {
            Some(id) => Some(account(pool, id, "icloud").await?),
            None => None,
        };
        let expected = match &old {
            Some(account) => Some(store::prepare_account(pool, human, &account.id).await?),
            None => None,
        };
        let adapter = CardDavAdapter::new(self.transport.clone());
        let remote = adapter
            .discover_account(&credential.authorization())
            .await?;
        let account = match old {
            Some(account) if account.account_key == remote.principal_key => account,
            Some(_) => return Err(ProviderError::IdentityMismatch),
            None => create_or_get_account(
                pool,
                &SourceAccountInput {
                    provider: "icloud".to_string(),
                    account_key: remote.principal_key,
                    label,
                },
            )
            .await
            .map_err(|_| ProviderError::Storage)?,
        };
        // Existing namespaces must reconnect explicitly, so a concurrent disconnect
        // cannot be undone by an independently started "new account" request.
        let epoch = match expected {
            Some(epoch) => epoch,
            None => {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM provider_accounts WHERE account_id=?1)",
                )
                .bind(&account.id)
                .fetch_one(pool)
                .await?;
                if exists {
                    return Err(ProviderError::Conflict);
                }
                let epoch: Option<i64> = sqlx::query_scalar("INSERT INTO provider_accounts(account_id,provider,owner_subject) VALUES(?1,'icloud',?2) ON CONFLICT DO NOTHING RETURNING epoch")
                    .bind(&account.id).bind(human.subject()).fetch_optional(pool).await?;
                AccountEpoch(epoch.ok_or(ProviderError::Conflict)?)
            }
        };
        store::install_credential(
            pool,
            &self.cipher,
            human,
            &account.id,
            epoch,
            &credential.encode(),
        )
        .await?;
        Ok(account.id)
    }
}

pub(super) async fn account(
    pool: &SqlitePool,
    id: &str,
    provider: &str,
) -> Result<SourceAccount, ProviderError> {
    sqlx::query_as("SELECT id,provider,account_key,label,created_at FROM source_accounts WHERE id=?1 AND provider=?2")
        .bind(id).bind(provider).fetch_optional(pool).await?.ok_or(ProviderError::NotFound)
}

pub(super) async fn bind_google_subject(
    pool: &SqlitePool,
    id: &str,
    epoch: AccountEpoch,
    subject: &str,
) -> Result<(), ProviderError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let current:String=sqlx::query_scalar("SELECT s.account_key FROM source_accounts s JOIN provider_accounts p ON p.account_id=s.id WHERE s.id=?1 AND p.epoch=?2 AND p.provider='google'")
        .bind(id).bind(epoch.0).fetch_optional(&mut *tx).await?.ok_or(ProviderError::Conflict)?;
    if current != subject {
        let unused: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM source_records WHERE account_id=?1) AND NOT EXISTS(SELECT 1 FROM provider_collection_states WHERE account_id=?1) AND NOT EXISTS(SELECT 1 FROM provider_accounts WHERE account_id=?1 AND connected=1)")
            .bind(id).fetch_one(&mut *tx).await?;
        if !current.starts_with("pending:") || !unused {
            return Err(ProviderError::IdentityMismatch);
        }
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM source_accounts WHERE provider='google' AND account_key=?1 AND id<>?2)").bind(subject).bind(id).fetch_one(&mut *tx).await?;
        if exists {
            return Err(ProviderError::Conflict);
        }
        sqlx::query("UPDATE source_accounts SET account_key=?1 WHERE id=?2")
            .bind(subject)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
