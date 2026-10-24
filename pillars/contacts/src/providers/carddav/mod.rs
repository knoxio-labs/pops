//! Read-only iCloud CardDAV discovery and fenced-page source observations.

mod discovery;
mod sync;
mod xml;

#[cfg(test)]
mod sync_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod xml_tests;

use super::credentials::SecretBytes;
use super::transport::{
    ProviderOrigin, ProviderRequest, ProviderResponse, ProviderTransport, TransportError,
};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use reqwest::Method;

/// Sanitized protocol failures contain no server payload, account ID or credential.
#[derive(Debug, PartialEq, Eq)]
pub enum CardDavError {
    /// The transport refused a target or could not complete the request.
    Transport,
    /// Authentication is invalid and requires reconnecting the account.
    Unauthorized,
    /// The server asked for a later retry; no observations should be finalized.
    RetryLater,
    /// The saved token is no longer valid; restart a complete enumeration.
    ResetRequired,
    /// The response violates the supported CardDAV contract.
    MalformedResponse,
    /// The response exceeds a bounded XML, member or property limit.
    ResponseLimit,
    /// The server failed or does not support a required read operation.
    Unavailable,
}

impl From<TransportError> for CardDavError {
    fn from(_: TransportError) -> Self {
        Self::Transport
    }
}

impl std::fmt::Display for CardDavError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Transport => "CONTACTS_CARDDAV_TRANSPORT_FAILED",
            Self::Unauthorized => "CONTACTS_CARDDAV_RECONNECT_REQUIRED",
            Self::RetryLater => "CONTACTS_CARDDAV_RETRY_LATER",
            Self::ResetRequired => "CONTACTS_CARDDAV_FULL_SYNC_REQUIRED",
            Self::MalformedResponse => "CONTACTS_CARDDAV_RESPONSE_INVALID",
            Self::ResponseLimit => "CONTACTS_CARDDAV_RESPONSE_TOO_LARGE",
            Self::Unavailable => "CONTACTS_CARDDAV_UNAVAILABLE",
        })
    }
}

impl std::error::Error for CardDavError {}

/// A discovered address book. The canonical URL is the source collection namespace.
#[derive(Clone, PartialEq, Eq)]
pub struct CardDavCollection {
    pub key: String,
    pub display_name: Option<String>,
}

/// Stateless read adapter. Durable leases, account fencing and checkpoint writes
/// belong to the shared provider coordinator, after all returned rows are staged.
pub struct CardDavAdapter<T> {
    transport: T,
}

impl<T: ProviderTransport> CardDavAdapter<T> {
    /// Construct an adapter over the vetted network transport or a fictional test transport.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    async fn request(
        &self,
        authorization: &SecretBytes,
        url: &str,
        method: &'static [u8],
        depth: &'static str,
        body: String,
    ) -> Result<ProviderResponse, CardDavError> {
        ProviderOrigin::Icloud.validate(url)?;
        let body = SecretBytes::new(body.into_bytes()).map_err(|_| CardDavError::ResponseLimit)?;
        let mut headers = HeaderMap::new();
        headers.insert("depth", HeaderValue::from_static(depth));
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/xml; charset=utf-8"),
        );
        let response = self
            .transport
            .send(ProviderRequest {
                origin: ProviderOrigin::Icloud,
                method: Method::from_bytes(method).map_err(|_| CardDavError::Unavailable)?,
                url,
                authorization: Some(authorization),
                headers,
                body: Some(&body),
            })
            .await?;
        match response.status.as_u16() {
            401 => Err(CardDavError::Unauthorized),
            429 | 503 => Err(CardDavError::RetryLater),
            300..=399 => Err(CardDavError::Transport),
            _ => Ok(response),
        }
    }
}

fn joined(base: &str, href: &str) -> Result<String, CardDavError> {
    if base.len() > 4096 || href.is_empty() || href.len() > 4096 {
        return Err(CardDavError::ResponseLimit);
    }
    let base = ProviderOrigin::Icloud.validate(base)?;
    let joined = base
        .join(href)
        .map_err(|_| CardDavError::MalformedResponse)?;
    Ok(ProviderOrigin::Icloud
        .validate(joined.as_str())?
        .to_string())
}

fn xml_text(value: &str) -> String {
    quick_xml::escape::escape(value).into_owned()
}
