//! Encrypted account credentials with revision fencing and source-owned removal.

use super::credentials::{CredentialCipher, SecretBytes};
use super::human_auth::HumanIdentity;
use crate::sources::repo::deactivate_record;
use sqlx::{SqliteConnection, SqlitePool};

/// Sanitized persistence failures with no bound values or database diagnostics.
#[derive(Debug, PartialEq, Eq)]
pub enum ProviderStoreError {
    /// The source account does not exist or has an unsupported provider.
    InvalidAccount,
    /// The account was disconnected or replaced after work started.
    StaleAccount,
    /// Encrypted credentials could not be authenticated or protected.
    CredentialUnavailable,
    /// Authorization state is missing, expired, replayed, or belongs to another human.
    InvalidState,
    /// Persistence failed; no partial transaction is committed.
    Unavailable,
}

impl std::fmt::Display for ProviderStoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::InvalidAccount => "CONTACTS_PROVIDER_ACCOUNT_INVALID",
            Self::StaleAccount => "CONTACTS_PROVIDER_ACCOUNT_CHANGED",
            Self::CredentialUnavailable => "CONTACTS_PROVIDER_CREDENTIAL_UNAVAILABLE",
            Self::InvalidState => "CONTACTS_PROVIDER_AUTHORIZATION_STATE_INVALID",
            Self::Unavailable => "CONTACTS_PROVIDER_STORE_UNAVAILABLE",
        })
    }
}

impl std::error::Error for ProviderStoreError {}

impl From<sqlx::Error> for ProviderStoreError {
    fn from(_: sqlx::Error) -> Self {
        Self::Unavailable
    }
}

/// Monotonically increasing account fence. Reconnect and disconnect invalidate
/// all jobs and callbacks holding an earlier epoch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccountEpoch(pub i64);

/// Decrypted worker credentials. No Debug/Serialize implementation is provided.
pub struct AccountCredential {
    /// Fixed provider type read from the account row.
    pub provider: String,
    /// Fence to check in the same transaction that applies provider results.
    pub epoch: AccountEpoch,
    /// Plaintext lives only in a zeroizing buffer at the authenticated boundary.
    pub secret: SecretBytes,
}

/// Prepare a provider account under a verified human. This stores no credential
/// and never marks the source account connected until installation succeeds.
pub async fn prepare_account(
    pool: &SqlitePool,
    operator: &HumanIdentity,
    account_id: &str,
) -> Result<AccountEpoch, ProviderStoreError> {
    let mut transaction = pool.begin().await?;
    let provider: Option<String> = sqlx::query_scalar(
        "SELECT provider FROM source_accounts WHERE id=?1 AND provider IN ('google','icloud')",
    )
    .bind(account_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let provider = provider.ok_or(ProviderStoreError::InvalidAccount)?;
    sqlx::query("INSERT INTO provider_accounts(account_id,provider,owner_subject) VALUES(?1,?2,?3) ON CONFLICT(account_id) DO NOTHING")
        .bind(account_id).bind(provider).bind(operator.subject()).execute(&mut *transaction).await?;
    let epoch = sqlx::query_scalar("SELECT epoch FROM provider_accounts WHERE account_id=?1")
        .bind(account_id)
        .fetch_one(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(AccountEpoch(epoch))
}

/// Install a credential only if the initiating account epoch is still current.
/// Successful installation fences older jobs and outstanding OAuth callbacks.
pub async fn install_credential(
    pool: &SqlitePool,
    cipher: &CredentialCipher,
    operator: &HumanIdentity,
    account_id: &str,
    expected: AccountEpoch,
    secret: &SecretBytes,
) -> Result<AccountEpoch, ProviderStoreError> {
    let provider: Option<String> = sqlx::query_scalar(
        "SELECT provider FROM provider_accounts WHERE account_id=?1 AND epoch=?2",
    )
    .bind(account_id)
    .bind(expected.0)
    .fetch_optional(pool)
    .await?;
    let provider = provider.ok_or(ProviderStoreError::StaleAccount)?;
    let encrypted = cipher
        .encrypt(&provider, account_id, secret)
        .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
    let mut transaction = pool.begin().await?;
    let epoch: Option<i64> = sqlx::query_scalar("UPDATE provider_accounts SET credential=?1,connected=1,owner_subject=?2,epoch=epoch+1 WHERE account_id=?3 AND epoch=?4 RETURNING epoch")
        .bind(encrypted).bind(operator.subject()).bind(account_id).bind(expected.0).fetch_optional(&mut *transaction).await?;
    let epoch = epoch.ok_or(ProviderStoreError::StaleAccount)?;
    sqlx::query("DELETE FROM provider_oauth_states WHERE account_id=?1")
        .bind(account_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(AccountEpoch(epoch))
}

/// Load connected account credentials for a worker. Callers must re-check the
/// returned epoch transactionally before applying any external result.
pub async fn load_credential(
    pool: &SqlitePool,
    cipher: &CredentialCipher,
    account_id: &str,
) -> Result<AccountCredential, ProviderStoreError> {
    let row: Option<(String,i64,Vec<u8>)> = sqlx::query_as("SELECT provider,epoch,credential FROM provider_accounts WHERE account_id=?1 AND connected=1")
        .bind(account_id).fetch_optional(pool).await?;
    let (provider, epoch, encrypted) = row.ok_or(ProviderStoreError::StaleAccount)?;
    let secret = cipher
        .decrypt(&provider, account_id, &encrypted)
        .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
    Ok(AccountCredential {
        provider,
        epoch: AccountEpoch(epoch),
        secret,
    })
}

/// Acquire the SQLite write fence and verify an account in the caller's apply
/// transaction. Holding it through commit prevents a disconnect racing results.
pub async fn fence_account(
    conn: &mut SqliteConnection,
    account_id: &str,
    expected: AccountEpoch,
) -> Result<(), ProviderStoreError> {
    let affected = sqlx::query(
        "UPDATE provider_accounts SET epoch=epoch WHERE account_id=?1 AND epoch=?2 AND connected=1",
    )
    .bind(account_id)
    .bind(expected.0)
    .execute(conn)
    .await?
    .rows_affected();
    if affected == 0 {
        Err(ProviderStoreError::StaleAccount)
    } else {
        Ok(())
    }
}

/// Disconnect atomically: erase encrypted credentials, fence in-flight work,
/// invalidate authorization state, and deactivate only this account's sources.
/// Canonical people, local overrides and other account contributions survive.
pub async fn disconnect_account(
    pool: &SqlitePool,
    _operator: &HumanIdentity,
    account_id: &str,
) -> Result<(), ProviderStoreError> {
    let mut transaction = pool.begin().await?;
    let affected = sqlx::query("UPDATE provider_accounts SET credential=NULL,connected=0,epoch=epoch+1 WHERE account_id=?1")
        .bind(account_id).execute(&mut *transaction).await?.rows_affected();
    if affected == 0 {
        return Err(ProviderStoreError::InvalidAccount);
    }
    sqlx::query("DELETE FROM provider_oauth_states WHERE account_id=?1")
        .bind(account_id)
        .execute(&mut *transaction)
        .await?;
    let records: Vec<String> =
        sqlx::query_scalar("SELECT id FROM source_records WHERE account_id=?1 AND active=1")
            .bind(account_id)
            .fetch_all(&mut *transaction)
            .await?;
    for record in records {
        deactivate_record(&mut transaction, &record)
            .await
            .map_err(|_| ProviderStoreError::Unavailable)?;
    }
    transaction.commit().await?;
    Ok(())
}

/// Replace a rotated worker credential only while the connection and previously
/// read encrypted value still match. Refresh does not invalidate scan epochs.
/// Concurrent refreshes must reload after a rejected compare-and-swap.
pub async fn refresh_credential(
    pool: &SqlitePool,
    cipher: &CredentialCipher,
    account_id: &str,
    expected: AccountEpoch,
    previous: &SecretBytes,
    replacement: &SecretBytes,
) -> Result<(), ProviderStoreError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    fence_account(&mut tx, account_id, expected).await?;
    let (provider, encrypted): (String, Vec<u8>) =
        sqlx::query_as("SELECT provider,credential FROM provider_accounts WHERE account_id=?1")
            .bind(account_id)
            .fetch_one(&mut *tx)
            .await?;
    let current = cipher
        .decrypt(&provider, account_id, &encrypted)
        .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
    if current.expose() != previous.expose() {
        return Err(ProviderStoreError::StaleAccount);
    }
    if current.expose() != replacement.expose() {
        let encrypted = cipher
            .encrypt(&provider, account_id, replacement)
            .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
        sqlx::query("UPDATE provider_accounts SET credential=?1 WHERE account_id=?2")
            .bind(encrypted)
            .bind(account_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
