//! Read-only Google authorization and token exchange over an injected transport.

use crate::providers::credentials::SecretBytes;
use crate::providers::oauth_state::ConsumedAuthorization;
use crate::providers::transport::{ProviderOrigin, ProviderRequest, ProviderTransport};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use reqwest::{Method, Url};
use serde::Deserialize;
use std::time::Duration;
use zeroize::Zeroizing;

/// The sole Google authorization scope requested by the contacts connector.
pub const CONTACTS_READ_ONLY: &str = "https://www.googleapis.com/auth/contacts.readonly";

/// Sanitized Google failures, excluding provider bodies and descriptions.
#[derive(Debug, PartialEq, Eq)]
pub enum GoogleError {
    /// The configured OAuth application or callback is invalid.
    InvalidConfiguration,
    /// The operator must authorize the account again.
    ReauthorizationRequired,
    /// The grant is absent or contains a scope beyond read-only contacts.
    ScopeDenied,
    /// Google or the network is temporarily unavailable.
    Retryable(Duration),
    /// An incremental cursor expired and requires a complete scan.
    CursorExpired,
    /// A provider response or configured callback is invalid.
    InvalidResponse,
}

impl std::fmt::Display for GoogleError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::InvalidConfiguration => "CONTACTS_GOOGLE_CONFIGURATION_INVALID",
            Self::ReauthorizationRequired => "CONTACTS_GOOGLE_REAUTHORIZATION_REQUIRED",
            Self::ScopeDenied => "CONTACTS_GOOGLE_SCOPE_DENIED",
            Self::Retryable(_) => "CONTACTS_GOOGLE_TEMPORARILY_UNAVAILABLE",
            Self::CursorExpired => "CONTACTS_GOOGLE_FULL_SYNC_REQUIRED",
            Self::InvalidResponse => "CONTACTS_GOOGLE_RESPONSE_INVALID",
        })
    }
}

impl std::error::Error for GoogleError {}

/// Confidential OAuth application configuration; the client secret cannot be
/// formatted or serialized. The callback is a fixed operator-configured HTTPS URI.
pub struct GoogleOAuthConfig {
    client_id: String,
    client_secret: SecretBytes,
    redirect_uri: String,
}

/// Browser authorization location. Its anti-CSRF state is intentionally excluded
/// from automatic formatting and diagnostic serialization.
pub struct AuthorizationLocation(Zeroizing<String>);

impl AuthorizationLocation {
    /// Borrow only when constructing the browser redirect response.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

/// Validated OAuth credentials. Persist only the refresh token through the
/// encrypted account store; access tokens remain ephemeral and expiry-bounded.
pub struct GoogleTokens {
    /// Short-lived Bearer token for the People API.
    pub access_token: SecretBytes,
    /// Replacement refresh token, or the prior refresh token when omitted.
    pub refresh_token: SecretBytes,
    /// Absolute Unix expiry, derived from the caller's trusted server clock.
    pub expires_at: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    #[serde(deserialize_with = "deserialize_secret")]
    access_token: SecretBytes,
    #[serde(default, deserialize_with = "deserialize_optional_secret")]
    refresh_token: Option<SecretBytes>,
    token_type: String,
    expires_in: u64,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenFailure {
    error: Option<String>,
}

impl GoogleOAuthConfig {
    /// Configure exact callbacks rather than accepting redirect targets from a
    /// browser request. Google registration must match the URI byte-for-byte.
    pub fn new(
        client_id: String,
        client_secret: SecretBytes,
        redirect_uri: &str,
    ) -> Result<Self, GoogleError> {
        let callback = Url::parse(redirect_uri).map_err(|_| GoogleError::InvalidConfiguration)?;
        if client_id.trim().is_empty()
            || client_id.len() > 1024
            || callback.scheme() != "https"
            || callback.host_str().is_none()
            || !callback.username().is_empty()
            || callback.password().is_some()
            || callback.query().is_some()
            || callback.fragment().is_some()
            || callback.path() != "/providers/google/callback"
        {
            return Err(GoogleError::InvalidConfiguration);
        }
        Ok(Self {
            client_id,
            client_secret,
            redirect_uri: redirect_uri.to_string(),
        })
    }

    /// Request read-only contacts, offline access and S256 PKCE with a previously
    /// persisted one-use state. Existing broader grants are not included.
    pub fn authorization_location(
        &self,
        state: &SecretBytes,
        pkce_challenge: &str,
    ) -> Result<AuthorizationLocation, GoogleError> {
        let state = text(state)?;
        if state.len() != 43 || pkce_challenge.len() != 43 {
            return Err(GoogleError::InvalidResponse);
        }
        let mut location = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
            .map_err(|_| GoogleError::InvalidResponse)?;
        location.query_pairs_mut().extend_pairs([
            ("client_id", self.client_id.as_str()),
            ("redirect_uri", self.redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", CONTACTS_READ_ONLY),
            ("access_type", "offline"),
            ("include_granted_scopes", "false"),
            ("prompt", "consent"),
            ("state", state),
            ("code_challenge", pkce_challenge),
            ("code_challenge_method", "S256"),
        ]);
        Ok(AuthorizationLocation(Zeroizing::new(location.into())))
    }

    /// Exchange a code only after durable state consumption. This method never
    /// installs credentials; installation must compare the consumed account epoch.
    pub async fn exchange_code<T: ProviderTransport>(
        &self,
        transport: &T,
        consumed: &ConsumedAuthorization,
        code: &SecretBytes,
        previous_refresh: Option<&SecretBytes>,
        now: u64,
    ) -> Result<GoogleTokens, GoogleError> {
        let body = form(&[
            ("grant_type", "authorization_code"),
            ("code", text(code)?),
            ("client_id", self.client_id.as_str()),
            ("client_secret", text(&self.client_secret)?),
            ("redirect_uri", self.redirect_uri.as_str()),
            ("code_verifier", text(&consumed.pkce_verifier)?),
        ])?;
        let response = token_request(transport, &body).await?;
        parse_tokens(response.body(), previous_refresh, true, now)
    }

    /// Refresh an expired access token. An omitted replacement refresh token
    /// preserves the stored credential; a revoked grant requires reconnection.
    pub async fn refresh<T: ProviderTransport>(
        &self,
        transport: &T,
        refresh_token: &SecretBytes,
        now: u64,
    ) -> Result<GoogleTokens, GoogleError> {
        let body = form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", text(refresh_token)?),
            ("client_id", self.client_id.as_str()),
            ("client_secret", text(&self.client_secret)?),
        ])?;
        let response = token_request(transport, &body).await?;
        parse_tokens(response.body(), Some(refresh_token), false, now)
    }
}

async fn token_request<T: ProviderTransport>(
    transport: &T,
    body: &SecretBytes,
) -> Result<crate::providers::transport::ProviderResponse, GoogleError> {
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    let response = transport
        .send(ProviderRequest {
            origin: ProviderOrigin::GoogleToken,
            method: Method::POST,
            url: "https://oauth2.googleapis.com/token",
            authorization: None,
            headers,
            body: Some(body),
        })
        .await
        .map_err(|_| GoogleError::Retryable(Duration::from_secs(2)))?;
    if response.status.is_success() {
        return Ok(response);
    }
    if response.status.as_u16() == 429 || response.status.is_server_error() {
        return Err(GoogleError::Retryable(retry_after(&response.headers)));
    }
    let failure: TokenFailure =
        serde_json::from_slice(response.body()).map_err(|_| GoogleError::InvalidResponse)?;
    Err(match failure.error.as_deref() {
        Some("invalid_grant") => GoogleError::ReauthorizationRequired,
        Some("invalid_client") => GoogleError::InvalidConfiguration,
        Some("invalid_scope") | Some("access_denied") => GoogleError::ScopeDenied,
        Some("temporarily_unavailable") | Some("server_error") => {
            GoogleError::Retryable(Duration::from_secs(2))
        }
        _ => GoogleError::InvalidResponse,
    })
}

fn parse_tokens(
    bytes: &[u8],
    previous_refresh: Option<&SecretBytes>,
    require_scope: bool,
    now: u64,
) -> Result<GoogleTokens, GoogleError> {
    let response: TokenResponse =
        serde_json::from_slice(bytes).map_err(|_| GoogleError::InvalidResponse)?;
    if !response.token_type.eq_ignore_ascii_case("Bearer")
        || response.expires_in == 0
        || response.expires_in > 86_400
    {
        return Err(GoogleError::InvalidResponse);
    }
    match response.scope.as_deref() {
        Some(scope)
            if scope.split_ascii_whitespace().collect::<Vec<_>>() == vec![CONTACTS_READ_ONLY] => {}
        None if !require_scope => {}
        _ => return Err(GoogleError::ScopeDenied),
    }
    let refresh_token = match response.refresh_token {
        Some(refresh) => refresh,
        None => SecretBytes::new(
            previous_refresh
                .ok_or(GoogleError::ReauthorizationRequired)?
                .expose()
                .to_vec(),
        )
        .map_err(|_| GoogleError::InvalidResponse)?,
    };
    Ok(GoogleTokens {
        access_token: response.access_token,
        refresh_token,
        expires_at: now
            .checked_add(response.expires_in)
            .ok_or(GoogleError::InvalidResponse)?,
    })
}

pub(super) fn retry_after(headers: &HeaderMap) -> Duration {
    let seconds = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(2);
    Duration::from_secs(seconds.min(60))
}

fn form(pairs: &[(&str, &str)]) -> Result<SecretBytes, GoogleError> {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer.extend_pairs(pairs.iter().copied());
    SecretBytes::new(serializer.finish().into_bytes()).map_err(|_| GoogleError::InvalidResponse)
}

fn text(secret: &SecretBytes) -> Result<&str, GoogleError> {
    std::str::from_utf8(secret.expose()).map_err(|_| GoogleError::InvalidResponse)
}

fn deserialize_secret<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<SecretBytes, D::Error> {
    let value = String::deserialize(deserializer)?;
    SecretBytes::new(value.into_bytes())
        .map_err(|_| serde::de::Error::custom("invalid bounded credential"))
}

fn deserialize_optional_secret<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<SecretBytes>, D::Error> {
    Option::<String>::deserialize(deserializer)?
        .map(|value| {
            SecretBytes::new(value.into_bytes())
                .map_err(|_| serde::de::Error::custom("invalid bounded credential"))
        })
        .transpose()
}

#[cfg(test)]
#[path = "oauth_tests.rs"]
mod tests;
