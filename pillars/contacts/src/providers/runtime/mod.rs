//! Optional provider management and a durable, leased background scan worker.

mod management;
mod worker;

use super::credentials::{CredentialCipher, SecretBytes};
use super::google::oauth::{GoogleError, GoogleOAuthConfig};
use super::google::session::{RetryDelay, TokioDelay};
use super::human_auth::HumanAccessVerifier;
use super::store::ProviderStoreError;
use super::sync::SyncError;
use super::transport::{NetworkTransport, ProviderTransport};
use std::path::Path;
use std::sync::Arc;

/// Sanitized management/worker classifications. Credentials and remote payloads
/// never enter error formatting or the API error envelope.
#[derive(Debug, PartialEq, Eq)]
pub enum ProviderError {
    /// Required key, Access or provider configuration is unavailable.
    Disabled,
    /// The authenticated provider subject differs from the source namespace.
    IdentityMismatch,
    /// A connection, authorization attempt or scan changed concurrently.
    Conflict,
    /// The provider requires the operator to reconnect.
    Reauthorize,
    /// A bounded operation should be retried later.
    Retryable,
    /// The provider requires a complete scan instead of its saved checkpoint.
    Reset,
    /// Provider output or operator input failed validation.
    Invalid,
    /// The account or run does not exist.
    NotFound,
    /// Encrypted persistence or scan storage is unavailable.
    Storage,
}
impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code())
    }
}
impl std::error::Error for ProviderError {}
impl ProviderError {
    /// Stable code suitable for durable failure state without remote text.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Disabled => "CONTACTS_PROVIDER_DISABLED",
            Self::IdentityMismatch => "CONTACTS_PROVIDER_IDENTITY_MISMATCH",
            Self::Conflict => "CONTACTS_PROVIDER_CHANGED",
            Self::Reauthorize => "CONTACTS_PROVIDER_RECONNECT_REQUIRED",
            Self::Retryable => "CONTACTS_PROVIDER_RETRY_LATER",
            Self::Reset => "CONTACTS_PROVIDER_FULL_SCAN_REQUIRED",
            Self::Invalid => "CONTACTS_PROVIDER_INVALID_RESPONSE",
            Self::NotFound => "CONTACTS_PROVIDER_NOT_FOUND",
            Self::Storage => "CONTACTS_PROVIDER_STORAGE_UNAVAILABLE",
        }
    }
}
impl From<ProviderStoreError> for ProviderError {
    fn from(error: ProviderStoreError) -> Self {
        match error {
            ProviderStoreError::StaleAccount | ProviderStoreError::InvalidState => Self::Conflict,
            ProviderStoreError::InvalidAccount => Self::NotFound,
            _ => Self::Storage,
        }
    }
}
impl From<SyncError> for ProviderError {
    fn from(error: SyncError) -> Self {
        match error {
            SyncError::Conflict | SyncError::StaleAccount => Self::Conflict,
            SyncError::NotFound => Self::NotFound,
            SyncError::Storage => Self::Storage,
            _ => Self::Invalid,
        }
    }
}
impl From<GoogleError> for ProviderError {
    fn from(error: GoogleError) -> Self {
        match error {
            GoogleError::ReauthorizationRequired => Self::Reauthorize,
            GoogleError::Retryable(_) => Self::Retryable,
            GoogleError::CursorExpired => Self::Reset,
            GoogleError::InvalidConfiguration => Self::Disabled,
            _ => Self::Invalid,
        }
    }
}
impl From<super::carddav::CardDavError> for ProviderError {
    fn from(error: super::carddav::CardDavError) -> Self {
        use super::carddav::CardDavError;
        match error {
            CardDavError::Unauthorized => Self::Reauthorize,
            CardDavError::ResetRequired => Self::Reset,
            CardDavError::Transport | CardDavError::RetryLater | CardDavError::Unavailable => {
                Self::Retryable
            }
            _ => Self::Invalid,
        }
    }
}
impl From<sqlx::Error> for ProviderError {
    fn from(_: sqlx::Error) -> Self {
        Self::Storage
    }
}

/// Process-local secrets and fixed provider clients. This type intentionally has
/// no Debug or Serialize implementation; only non-secret status DTOs leave it.
pub struct ProviderRuntime {
    pub(super) cipher: CredentialCipher,
    /// Explicit human verifier used for connection administration.
    pub human: HumanAccessVerifier,
    pub(super) google: Option<GoogleOAuthConfig>,
    pub(super) transport: Arc<dyn ProviderTransport>,
    pub(super) delay: Arc<dyn RetryDelay>,
}
impl ProviderRuntime {
    /// Construct configured services over a vetted transport or a fictional test
    /// transport. The human verifier never admits an absent Access assertion.
    pub fn new(
        cipher: CredentialCipher,
        human: HumanAccessVerifier,
        google: Option<GoogleOAuthConfig>,
        transport: Arc<dyn ProviderTransport>,
        delay: Arc<dyn RetryDelay>,
    ) -> Self {
        Self {
            cipher,
            human,
            google,
            transport,
            delay,
        }
    }
    /// Enable connections only with a valid Docker-secret root key and explicit
    /// human Access settings. Missing Google settings disable Google alone.
    /// Failure does not prevent unrelated contacts APIs from starting.
    pub fn from_env() -> Option<Self> {
        let path = std::env::var("CONTACTS_PROVIDER_ROOT_KEY_FILE").ok()?;
        let cipher = CredentialCipher::from_secret_file(Path::new(&path)).ok()?;
        let human = HumanAccessVerifier::from_env().ok()?;
        let google = (|| {
            let client_id = std::env::var("CONTACTS_GOOGLE_CLIENT_ID").ok()?;
            let path = std::env::var("CONTACTS_GOOGLE_CLIENT_SECRET_FILE").ok()?;
            let secret = SecretBytes::from_secret_file(Path::new(&path)).ok()?;
            let callback = std::env::var("CONTACTS_GOOGLE_CALLBACK_URL").ok()?;
            GoogleOAuthConfig::new(client_id, secret, &callback).ok()
        })();
        Some(Self::new(
            cipher,
            human,
            google,
            Arc::new(NetworkTransport),
            Arc::new(TokioDelay),
        ))
    }
}

pub(crate) fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs().min(i64::MAX as u64) as i64)
}

#[cfg(test)]
mod tests;
