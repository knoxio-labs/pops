use super::{management::account, now, ProviderError, ProviderRuntime};
use crate::providers::carddav::{credential::CardDavCredential, CardDavAdapter, CardDavCollection};
use crate::providers::google::{
    people,
    session::{retry, GoogleSession},
};
use crate::providers::store::{self, AccountCredential};
use crate::providers::sync::{self, lease, CollectionPlan, SyncRun};
use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::Duration;

impl ProviderRuntime {
    /// Discover the credential's actual account and start an account-serialized
    /// durable scan. The verified namespace cannot change during reconnect/sync.
    pub async fn start_sync(&self, pool: &SqlitePool, id: &str) -> Result<SyncRun, ProviderError> {
        let credential = store::load_credential(pool, &self.cipher, id).await?;
        let result = self.start_sync_with_credential(pool, id, &credential).await;
        if matches!(result, Err(ProviderError::Reauthorize)) {
            sqlx::query("UPDATE provider_accounts SET reauthorization_required=1 WHERE account_id=?1 AND epoch=?2 AND connected=1")
                .bind(id).bind(credential.epoch.0).execute(pool).await?;
        }
        result
    }

    async fn start_sync_with_credential(
        &self,
        pool: &SqlitePool,
        id: &str,
        credential: &AccountCredential,
    ) -> Result<SyncRun, ProviderError> {
        let source = account(pool, id, &credential.provider).await?;
        let paused: bool = sqlx::query_scalar(
            "SELECT reauthorization_required FROM provider_accounts WHERE account_id=?1",
        )
        .bind(id)
        .fetch_one(pool)
        .await?;
        if paused {
            return Err(ProviderError::Reauthorize);
        }
        sqlx::query(
            "UPDATE provider_accounts SET next_sync_at=?1 WHERE account_id=?2 AND epoch=?3",
        )
        .bind(now() + 60)
        .bind(id)
        .bind(credential.epoch.0)
        .execute(pool)
        .await?;
        let keys = match credential.provider.as_str() {
            "google" => {
                self.google_collections(pool, id, credential, &source.account_key)
                    .await?
            }
            "icloud" => {
                let secret = CardDavCredential::decode(&credential.secret)
                    .map_err(|_| ProviderError::Storage)?
                    .authorization();
                let remote = CardDavAdapter::new(self.transport.clone())
                    .discover_account(&secret)
                    .await?;
                if remote.principal_key != source.account_key {
                    return Err(ProviderError::IdentityMismatch);
                }
                remote
                    .collections
                    .into_iter()
                    .map(|collection| collection.key)
                    .collect()
            }
            _ => return Err(ProviderError::Invalid),
        };
        let mut plans = Vec::new();
        for key in keys {
            let full_snapshot = sync::checkpoint(pool, id, &key).await?.is_none();
            plans.push(CollectionPlan { key, full_snapshot });
        }
        let run = sync::begin_sync(pool, id, credential.epoch, &plans).await?;
        sqlx::query(
            "UPDATE provider_accounts SET next_sync_at=?1 WHERE account_id=?2 AND epoch=?3",
        )
        .bind(now() + 3600)
        .bind(id)
        .bind(credential.epoch.0)
        .execute(pool)
        .await?;
        Ok(run)
    }

    /// Process at most one durable page/finalization. Network time is bounded
    /// below the five-minute lease; every write checks lease and account epoch.
    pub async fn work_once(&self, pool: &SqlitePool) -> Result<bool, ProviderError> {
        let Some(claim) = lease::claim(pool, now()).await? else {
            return Ok(false);
        };
        let result = tokio::time::timeout(Duration::from_secs(240), self.step(pool, &claim))
            .await
            .unwrap_or(Err(ProviderError::Retryable));
        match result {
            Ok(()) => {}
            Err(ProviderError::Retryable) => {
                lease::release(pool, &claim, true, now()).await?;
            }
            Err(ProviderError::Conflict) => {
                let run = sync::get_run(pool, &claim.run_id).await?;
                match store::load_credential(pool, &self.cipher, &run.account_id).await {
                    Ok(credential) if credential.epoch == run.epoch => {
                        match lease::release(pool, &claim, false, now()).await {
                            Ok(()) | Err(sync::SyncError::Conflict) => return Ok(true),
                            Err(error) => return Err(error.into()),
                        }
                    }
                    Ok(_) | Err(store::ProviderStoreError::StaleAccount) => {}
                    Err(error) => return Err(error.into()),
                }
                sync::abort_sync(pool, &claim.run_id, sync::SyncError::StaleAccount).await?;
            }
            Err(error) => {
                lease::fail(
                    pool,
                    &claim,
                    error.code(),
                    error == ProviderError::Reauthorize,
                    now(),
                )
                .await?;
            }
        }
        Ok(true)
    }

    async fn step(&self, pool: &SqlitePool, claim: &lease::RunLease) -> Result<(), ProviderError> {
        let run = sync::get_run(pool, &claim.run_id).await?;
        let credential = store::load_credential(pool, &self.cipher, &run.account_id).await?;
        if credential.epoch != run.epoch {
            return Err(ProviderError::Conflict);
        }
        let Some(collection) = run
            .collections
            .iter()
            .find(|collection| !collection.complete)
        else {
            sync::finalize_claimed(pool, claim, now()).await?;
            return Ok(());
        };
        let result = match credential.provider.as_str() {
            "google" => self.google_page(pool, &run, &credential, collection).await,
            "icloud" => {
                let authorization = CardDavCredential::decode(&credential.secret)
                    .map_err(|_| ProviderError::Storage)?
                    .authorization();
                let etags = sync::known_etags(pool, &run.account_id, &collection.key).await?;
                CardDavAdapter::new(self.transport.clone())
                    .sync_page(
                        &authorization,
                        &CardDavCollection {
                            key: collection.key.clone(),
                            display_name: None,
                        },
                        collection.checkpoint.as_deref(),
                        collection.continuation.as_deref(),
                        &etags,
                    )
                    .await
                    .map_err(Into::into)
            }
            _ => Err(ProviderError::Invalid),
        };
        match result {
            Ok(page) => {
                sync::service::stage_page_claimed(
                    pool,
                    claim,
                    &collection.key,
                    collection.continuation.as_deref(),
                    &page,
                    now(),
                )
                .await?
            }
            Err(ProviderError::Reset) => {
                lease::reset_full(pool, claim, &collection.key, now()).await?
            }
            Err(error) => return Err(error),
        }
        lease::release(pool, claim, false, now()).await?;
        Ok(())
    }

    async fn google_page(
        &self,
        pool: &SqlitePool,
        run: &SyncRun,
        credential: &AccountCredential,
        collection: &sync::SyncCollection,
    ) -> Result<sync::ProviderPage, ProviderError> {
        let claim = store::claim_refresh(pool, &run.account_id, run.epoch, now()).await?;
        let result = self
            .google_page_claimed(pool, credential, collection, &claim)
            .await;
        store::release_refresh(pool, &claim).await?;
        result
    }

    async fn google_collections(
        &self,
        pool: &SqlitePool,
        id: &str,
        credential: &AccountCredential,
        subject: &str,
    ) -> Result<Vec<String>, ProviderError> {
        let claim = store::claim_refresh(pool, id, credential.epoch, now()).await?;
        let result = async {
            let config = self.google.as_ref().ok_or(ProviderError::Disabled)?;
            let tokens = retry(&self.delay, || {
                config.refresh_with_other_contacts(
                    &self.transport,
                    &credential.secret,
                    credential.include_other_contacts,
                    now() as u64,
                )
            })
            .await?;
            store::refresh_claimed(
                pool,
                &self.cipher,
                &claim,
                &credential.secret,
                &tokens.refresh_token,
                now(),
            )
            .await?;
            let key = retry(&self.delay, || {
                people::account_key(&self.transport, &tokens.access_token)
            })
            .await?;
            if key != subject {
                return Err(ProviderError::IdentityMismatch);
            }
            let mut collections = vec!["contacts".to_string()];
            if credential.include_other_contacts {
                collections.push("other_contacts".to_string());
            }
            Ok(collections)
        }
        .await;
        store::release_refresh(pool, &claim).await?;
        result
    }

    async fn google_page_claimed(
        &self,
        pool: &SqlitePool,
        credential: &AccountCredential,
        collection: &sync::SyncCollection,
        claim: &store::RefreshLease,
    ) -> Result<sync::ProviderPage, ProviderError> {
        let config = self.google.as_ref().ok_or(ProviderError::Disabled)?;
        let tokens = retry(&self.delay, || {
            config.refresh_with_other_contacts(
                &self.transport,
                &credential.secret,
                credential.include_other_contacts,
                now() as u64,
            )
        })
        .await?;
        store::refresh_claimed(
            pool,
            &self.cipher,
            claim,
            &credential.secret,
            &tokens.refresh_token,
            now(),
        )
        .await?;
        let previous =
            crate::providers::credentials::SecretBytes::new(tokens.refresh_token.expose().to_vec())
                .map_err(|_| ProviderError::Storage)?;
        let mut session = GoogleSession::new(config, &self.transport, &self.delay, tokens)
            .with_other_contacts(credential.include_other_contacts);
        let result = match collection.key.as_str() {
            "contacts" => {
                session
                    .page(
                        collection.checkpoint.as_deref(),
                        collection.continuation.as_deref(),
                        now() as u64,
                    )
                    .await
            }
            "other_contacts" => {
                session
                    .other_contacts_page(
                        collection.checkpoint.as_deref(),
                        collection.continuation.as_deref(),
                        now() as u64,
                    )
                    .await
            }
            _ => return Err(ProviderError::Invalid),
        };
        store::refresh_claimed(
            pool,
            &self.cipher,
            claim,
            &previous,
            session.refresh_token(),
            now(),
        )
        .await?;
        result.map_err(Into::into)
    }

    /// Resume unfinished scans on startup and schedule connected accounts hourly.
    /// Shutdown cancels only process work; durable claims become resumable on expiry.
    pub fn spawn(self: Arc<Self>, pool: SqlitePool) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut timer = tokio::time::interval(Duration::from_secs(2));
            loop {
                timer.tick().await;
                match self.work_once(&pool).await {
                    Ok(true) => continue,
                    Err(error) => {
                        tracing::warn!(classification=%error,"provider worker operation failed")
                    }
                    Ok(false) => {}
                }
                let due:Result<Option<String>,sqlx::Error>=sqlx::query_scalar("SELECT account_id FROM provider_accounts p WHERE connected=1 AND reauthorization_required=0 AND next_sync_at<=?1 AND (provider<>'google' OR ?2) AND NOT EXISTS(SELECT 1 FROM provider_sync_runs r WHERE r.account_id=p.account_id AND r.status='running') ORDER BY next_sync_at,account_id LIMIT 1")
                    .bind(now()).bind(self.google.is_some()).fetch_optional(&pool).await;
                if let Ok(Some(id)) = due {
                    let result =
                        tokio::time::timeout(Duration::from_secs(240), self.start_sync(&pool, &id))
                            .await;
                    if let Ok(Err(error)) = result {
                        tracing::warn!(classification=%error,"provider scan could not start");
                    }
                }
            }
        })
    }
}
