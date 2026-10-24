//! Bounded retry and single-refresh recovery for read-only Google requests.

use super::oauth::{GoogleError, GoogleOAuthConfig, GoogleTokens};
use super::people;
use crate::providers::credentials::SecretBytes;
use crate::providers::sync::ProviderPage;
use crate::providers::transport::ProviderTransport;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

/// Injectable asynchronous delay so retry timing can be verified without waiting.
pub trait RetryDelay: Send + Sync {
    /// Wait for the bounded server/backoff interval before the next attempt.
    fn wait(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;
}

/// Tokio-backed production retry timer.
pub struct TokioDelay;
impl RetryDelay for TokioDelay {
    fn wait(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(tokio::time::sleep(duration))
    }
}

/// Attempt a Google operation at most three times. Retry-After and exponential
/// backoff are bounded to one through sixty seconds; permanent failures stop now.
pub async fn retry<R, F, Fut, D: RetryDelay>(delay: &D, mut operation: F) -> Result<R, GoogleError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<R, GoogleError>>,
{
    for attempt in 0..3 {
        match operation().await {
            Err(GoogleError::Retryable(server)) if attempt < 2 => {
                let backoff = Duration::from_secs(1 << attempt);
                delay
                    .wait(server.max(backoff).min(Duration::from_secs(60)))
                    .await;
            }
            result => return result,
        }
    }
    Err(GoogleError::InvalidResponse)
}

/// Ephemeral access-token session. A worker must persist a changed refresh token
/// through the encrypted store's compare-and-swap after every operation, including
/// failed operations. Access tokens are never persisted.
pub struct GoogleSession<'a, T, D> {
    config: &'a GoogleOAuthConfig,
    transport: &'a T,
    delay: &'a D,
    tokens: GoogleTokens,
}

impl<'a, T: ProviderTransport, D: RetryDelay> GoogleSession<'a, T, D> {
    /// Resume from freshly refreshed credentials or an authenticated code exchange.
    pub fn new(
        config: &'a GoogleOAuthConfig,
        transport: &'a T,
        delay: &'a D,
        tokens: GoogleTokens,
    ) -> Self {
        Self {
            config,
            transport,
            delay,
            tokens,
        }
    }

    /// Current refresh material, borrowed only for encrypted persistence.
    pub fn refresh_token(&self) -> &SecretBytes {
        &self.tokens.refresh_token
    }

    async fn refresh(&mut self, now: u64) -> Result<(), GoogleError> {
        self.tokens = retry(self.delay, || {
            self.config
                .refresh(self.transport, &self.tokens.refresh_token, now)
        })
        .await?;
        Ok(())
    }

    /// Fetch a page with proactive expiry refresh and one 401-triggered refresh.
    /// A repeated 401 or revoked refresh grant requires reconnection.
    pub async fn page(
        &mut self,
        checkpoint: Option<&str>,
        continuation: Option<&str>,
        now: u64,
    ) -> Result<ProviderPage, GoogleError> {
        if self.tokens.expires_at <= now.saturating_add(30) {
            self.refresh(now).await?;
        }
        let first = retry(self.delay, || {
            people::sync_page(
                self.transport,
                &self.tokens.access_token,
                checkpoint,
                continuation,
                now,
            )
        })
        .await;
        if !matches!(first, Err(GoogleError::ReauthorizationRequired)) {
            return first;
        }
        self.refresh(now).await?;
        retry(self.delay, || {
            people::sync_page(
                self.transport,
                &self.tokens.access_token,
                checkpoint,
                continuation,
                now,
            )
        })
        .await
    }
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
