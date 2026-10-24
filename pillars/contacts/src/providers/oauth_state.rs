//! Durable one-use OAuth state, bound to human identity and an account epoch.

use super::credentials::{CredentialCipher, SecretBytes};
use super::human_auth::HumanIdentity;
use super::store::{AccountEpoch, ProviderStoreError};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ring::digest::{digest, SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use sqlx::SqlitePool;
use zeroize::Zeroizing;

/// An authorization attempt. State is secret; only its hash is persisted.
pub struct AuthorizationAttempt {
    /// One-use random state sent through the browser's authorization redirect.
    pub state: SecretBytes,
    /// Public S256 PKCE challenge; the verifier is encrypted in SQLite.
    pub pkce_challenge: String,
}

/// The consumed attempt for a code exchange. No formatting or serialization.
pub struct ConsumedAuthorization {
    /// Source account namespace selected by the initiating operator.
    pub account_id: String,
    /// Fence required when storing the exchanged refresh credential.
    pub epoch: AccountEpoch,
    /// Decrypted PKCE verifier passed only to Google's fixed token endpoint.
    pub pkce_verifier: SecretBytes,
}

/// Begin a ten-minute Google authorization attempt for a prepared account.
/// The trusted server clock is explicit so expiry boundaries can be tested.
pub async fn begin_authorization(
    pool: &SqlitePool,
    cipher: &CredentialCipher,
    operator: &HumanIdentity,
    account_id: &str,
    expected: AccountEpoch,
    now: i64,
) -> Result<AuthorizationAttempt, ProviderStoreError> {
    let expires = now
        .checked_add(600)
        .filter(|_| now >= 0)
        .ok_or(ProviderStoreError::InvalidState)?;
    let random = SystemRandom::new();
    let mut state = Zeroizing::new([0u8; 32]);
    let mut verifier = Zeroizing::new([0u8; 32]);
    random
        .fill(&mut *state)
        .map_err(|_| ProviderStoreError::Unavailable)?;
    random
        .fill(&mut *verifier)
        .map_err(|_| ProviderStoreError::Unavailable)?;
    let state = SecretBytes::new(URL_SAFE_NO_PAD.encode(state.as_ref()).into_bytes())
        .map_err(|_| ProviderStoreError::Unavailable)?;
    let verifier = SecretBytes::new(URL_SAFE_NO_PAD.encode(verifier.as_ref()).into_bytes())
        .map_err(|_| ProviderStoreError::Unavailable)?;
    let state_hash = digest(&SHA256, state.expose());
    let binding = state_binding(account_id, state_hash.as_ref());
    let encrypted = cipher
        .encrypt("google-oauth-pkce", &binding, &verifier)
        .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM provider_oauth_states WHERE expires_at<=?1 OR account_epoch<>(SELECT epoch FROM provider_accounts WHERE account_id=provider_oauth_states.account_id)")
        .bind(now).execute(&mut *transaction).await?;
    let inserted = sqlx::query("INSERT INTO provider_oauth_states(state_hash,account_id,owner_subject,account_epoch,expires_at,verifier) SELECT ?1,account_id,?2,epoch,?3,?4 FROM provider_accounts WHERE account_id=?5 AND epoch=?6 AND provider='google'")
        .bind(state_hash.as_ref()).bind(operator.subject()).bind(expires).bind(encrypted).bind(account_id).bind(expected.0).execute(&mut *transaction).await?.rows_affected();
    if inserted == 0 {
        return Err(ProviderStoreError::StaleAccount);
    }
    transaction.commit().await?;
    Ok(AuthorizationAttempt {
        state,
        pkce_challenge: URL_SAFE_NO_PAD.encode(digest(&SHA256, verifier.expose())),
    })
}

/// Consume before exchanging a code. The conditional DELETE is atomic, so replay
/// and concurrent callbacks cannot both succeed. Wrong humans do not burn state.
pub async fn consume_authorization(
    pool: &SqlitePool,
    cipher: &CredentialCipher,
    operator: &HumanIdentity,
    state: &SecretBytes,
    now: i64,
) -> Result<ConsumedAuthorization, ProviderStoreError> {
    if state.expose().len() != 43 || now < 0 {
        return Err(ProviderStoreError::InvalidState);
    }
    let state_hash = digest(&SHA256, state.expose());
    let row: Option<(String,i64,Vec<u8>)> = sqlx::query_as("DELETE FROM provider_oauth_states WHERE state_hash=?1 AND owner_subject=?2 AND expires_at>?3 AND account_epoch=(SELECT epoch FROM provider_accounts WHERE account_id=provider_oauth_states.account_id) RETURNING account_id,account_epoch,verifier")
        .bind(state_hash.as_ref()).bind(operator.subject()).bind(now).fetch_optional(pool).await?;
    let (account_id, epoch, encrypted) = row.ok_or(ProviderStoreError::InvalidState)?;
    let binding = state_binding(&account_id, state_hash.as_ref());
    let pkce_verifier = cipher
        .decrypt("google-oauth-pkce", &binding, &encrypted)
        .map_err(|_| ProviderStoreError::CredentialUnavailable)?;
    Ok(ConsumedAuthorization {
        account_id,
        epoch: AccountEpoch(epoch),
        pkce_verifier,
    })
}

fn state_binding(account_id: &str, state_hash: &[u8]) -> String {
    format!("{}:{}", account_id, URL_SAFE_NO_PAD.encode(state_hash))
}
