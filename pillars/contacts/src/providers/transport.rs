//! HTTPS-only provider transport with per-connection public DNS pinning.

use super::credentials::SecretBytes;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_LENGTH};
use reqwest::{Method, StatusCode, Url};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;
use zeroize::Zeroizing;

const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

/// Approved outbound service; hosts are code-owned rather than account input.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderOrigin {
    /// Google's fixed OAuth token origin.
    GoogleToken,
    /// Google's fixed People API origin.
    GooglePeople,
    /// Apple's CardDAV discovery origin and numbered contacts shard origins.
    Icloud,
    /// The fixed key path on a single-label Cloudflare Access team origin.
    CloudflareAccessKeys,
}

/// Sanitized transport errors never retain a URL, response body or credential.
#[derive(Debug, PartialEq, Eq)]
pub enum TransportError {
    /// A URL or resolved address is outside the provider's approved boundary.
    DisallowedTarget,
    /// DNS or the network request failed, including timeout.
    Unavailable,
    /// An authorization header could not be constructed safely.
    InvalidAuthorization,
    /// A response exceeded the bounded body limit.
    ResponseTooLarge,
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::DisallowedTarget => "CONTACTS_PROVIDER_TARGET_REJECTED",
            Self::Unavailable => "CONTACTS_PROVIDER_UNAVAILABLE",
            Self::InvalidAuthorization => "CONTACTS_PROVIDER_AUTHORIZATION_INVALID",
            Self::ResponseTooLarge => "CONTACTS_PROVIDER_RESPONSE_TOO_LARGE",
        })
    }
}

impl std::error::Error for TransportError {}

/// A bounded response without Debug/Serialize implementations; provider payloads
/// may contain tokens or personal data and must not appear in diagnostics.
pub struct ProviderResponse {
    /// HTTP status is interpreted by the provider adapter, including HTTP 207.
    pub status: StatusCode,
    /// Provider response headers, including Retry-After and ETag.
    pub headers: HeaderMap,
    body: Zeroizing<Vec<u8>>,
}

impl ProviderResponse {
    /// Borrow response bytes for provider-specific parsing.
    pub fn body(&self) -> &[u8] {
        &self.body
    }
}

impl ProviderOrigin {
    /// Parse and constrain a URL before attaching credentials or resolving DNS.
    /// Discovery hrefs must be joined against a previously approved URL first.
    pub fn validate(self, input: &str) -> Result<Url, TransportError> {
        let url = Url::parse(input).map_err(|_| TransportError::DisallowedTarget)?;
        let host = url.host_str().ok_or(TransportError::DisallowedTarget)?;
        let host_allowed = match self {
            Self::GoogleToken => {
                host == "oauth2.googleapis.com" && url.path() == "/token" && url.query().is_none()
            }
            Self::GooglePeople => host == "people.googleapis.com",
            Self::CloudflareAccessKeys => {
                host.strip_suffix(".cloudflareaccess.com")
                    .is_some_and(valid_team_name)
                    && url.path() == "/cdn-cgi/access/certs"
                    && url.query().is_none()
            }
            Self::Icloud => {
                host == "contacts.icloud.com"
                    || host == "carddav.icloud.com"
                    || is_icloud_shard(host)
            }
        };
        if !host_allowed
            || url.scheme() != "https"
            || url.port_or_known_default() != Some(443)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || (self == Self::Icloud && url.query().is_some())
        {
            return Err(TransportError::DisallowedTarget);
        }
        Ok(url)
    }

    /// Send one request with redirects and proxies disabled. All DNS answers must
    /// be public and are pinned into this request's client to prevent rebinding.
    /// Redirects are returned unchanged; credentials never follow them.
    pub async fn request(
        self,
        method: Method,
        input: &str,
        authorization: Option<&SecretBytes>,
        mut headers: HeaderMap,
        body: Option<&SecretBytes>,
    ) -> Result<ProviderResponse, TransportError> {
        let url = self.validate(input)?;
        let host = url.host_str().ok_or(TransportError::DisallowedTarget)?;
        let addresses: Vec<SocketAddr> =
            tokio::time::timeout(Duration::from_secs(5), tokio::net::lookup_host((host, 443)))
                .await
                .map_err(|_| TransportError::Unavailable)?
                .map_err(|_| TransportError::Unavailable)?
                .collect();
        validate_addresses(&addresses)?;
        let client = pinned_client(host, &addresses)?;
        if let Some(authorization) = authorization {
            let mut value = HeaderValue::from_bytes(authorization.expose())
                .map_err(|_| TransportError::InvalidAuthorization)?;
            value.set_sensitive(true);
            headers.insert(AUTHORIZATION, value);
        }
        let mut request = client.request(method, url).headers(headers);
        if let Some(body) = body {
            request = request.body(body.expose().to_vec());
        }
        let response = request
            .send()
            .await
            .map_err(|_| TransportError::Unavailable)?;
        read_response(response).await
    }
}

pub(super) fn valid_team_name(team: &str) -> bool {
    !team.is_empty()
        && team.len() <= 63
        && !team.starts_with('-')
        && !team.ends_with('-')
        && team
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn pinned_client(host: &str, addresses: &[SocketAddr]) -> Result<reqwest::Client, TransportError> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .resolve_to_addrs(host, addresses)
        .build()
        .map_err(|_| TransportError::Unavailable)
}

fn is_icloud_shard(host: &str) -> bool {
    host.strip_prefix('p')
        .and_then(|rest| rest.strip_suffix("-contacts.icloud.com"))
        .is_some_and(|number| {
            !number.is_empty()
                && number.len() <= 4
                && number.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn validate_addresses(addresses: &[SocketAddr]) -> Result<(), TransportError> {
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| !public_address(address.ip()))
    {
        return Err(TransportError::DisallowedTarget);
    }
    Ok(())
}

fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => public_ipv4(address),
        IpAddr::V6(address) => public_ipv6(address),
    }
}

fn public_ipv4(address: Ipv4Addr) -> bool {
    let [first, second, third, _] = address.octets();
    !address.is_private()
        && !address.is_loopback()
        && !address.is_link_local()
        && !address.is_multicast()
        && !address.is_broadcast()
        && !address.is_unspecified()
        && first != 0
        && first < 224
        && !(first == 100 && (64..=127).contains(&second))
        && !(first == 192 && second == 0)
        && !(first == 192 && second == 88 && third == 99)
        && !(first == 198 && (18..=19).contains(&second))
        && !address.is_documentation()
}

fn public_ipv6(address: Ipv6Addr) -> bool {
    let segments = address.segments();
    (segments[0] & 0xe000) == 0x2000
        && (segments[0] != 0x2001 || segments[1] >= 0x0200)
        && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        && segments[0] != 0x2002
        && !(segments[0] == 0x3fff && (segments[1] & 0xf000) == 0)
}

async fn read_response(
    mut response: reqwest::Response,
) -> Result<ProviderResponse, TransportError> {
    if response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(TransportError::ResponseTooLarge);
    }
    let status = response.status();
    let headers = response.headers().clone();
    let mut body = Zeroizing::new(Vec::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| TransportError::Unavailable)?
    {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(TransportError::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(ProviderResponse {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_provider_origins_are_exact_https_boundaries() {
        for url in [
            "https://contacts.icloud.com/",
            "https://carddav.icloud.com/",
            "https://p144-contacts.icloud.com/123/carddav/",
        ] {
            assert!(ProviderOrigin::Icloud.validate(url).is_ok());
        }
        for url in [
            "http://carddav.icloud.com/",
            "https://carddav.icloud.com:444/",
            "https://carddav.icloud.com.evil.example/",
            "https://user:pass@carddav.icloud.com/",
            "https://carddav.icloud.com/#fragment",
            "https://carddav.icloud.com/?next=elsewhere",
            "https://p-contacts.icloud.com/",
            "https://p2-contacts.icloud.com.evil.example/",
            "https://127.0.0.1/",
            "https://[::1]/",
            "https://evil.icloud.com/",
        ] {
            assert_eq!(
                ProviderOrigin::Icloud.validate(url),
                Err(TransportError::DisallowedTarget)
            );
        }
        assert!(ProviderOrigin::GoogleToken
            .validate("https://oauth2.googleapis.com/token")
            .is_ok());
        assert!(ProviderOrigin::GoogleToken
            .validate("https://people.googleapis.com/")
            .is_err());
        assert!(ProviderOrigin::GooglePeople
            .validate("https://people.googleapis.com/v1/people/me/connections")
            .is_ok());
    }

    #[test]
    fn private_special_and_mixed_dns_answers_are_rejected() {
        for ip in [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.1.1",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "198.19.0.1",
            "192.0.0.1",
            "192.0.2.1",
            "224.0.0.1",
            "240.0.0.1",
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "2002:7f00:1::1",
            "2001::1",
            "3fff::1",
        ] {
            let address = SocketAddr::new(ip.parse().unwrap(), 443);
            assert_eq!(
                validate_addresses(&[address]),
                Err(TransportError::DisallowedTarget),
                "{ip}"
            );
        }
        let public = "8.8.8.8:443".parse().unwrap();
        assert!(validate_addresses(&[public]).is_ok());
        assert!(validate_addresses(&[public, "127.0.0.1:443".parse().unwrap()]).is_err());
        assert!(validate_addresses(&[]).is_err());
        assert!(public_address("2606:4700::1111".parse().unwrap()));
    }

    #[tokio::test]
    async fn redirects_never_forward_authorization_to_another_origin() {
        use axum::routing::get;
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let calls = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&calls);
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_address = target_listener.local_addr().unwrap();
        let target = tokio::spawn(async move {
            axum::serve(
                target_listener,
                axum::Router::new().route(
                    "/",
                    get(move || async move {
                        observed.fetch_add(1, Ordering::SeqCst);
                        StatusCode::OK
                    }),
                ),
            )
            .await
            .unwrap();
        });
        let origin_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin_address = origin_listener.local_addr().unwrap();
        let location = format!("http://{target_address}/");
        let origin = tokio::spawn(async move {
            axum::serve(
                origin_listener,
                axum::Router::new().route(
                    "/",
                    get(move || async move {
                        (StatusCode::TEMPORARY_REDIRECT, [("location", location)])
                    }),
                ),
            )
            .await
            .unwrap();
        });
        let client = pinned_client("localhost", &[origin_address]).unwrap();
        let response = client
            .get(format!("http://{origin_address}/"))
            .header(AUTHORIZATION, "Bearer synthetic-test-value")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        origin.abort();
        target.abort();
    }

    #[tokio::test]
    async fn oversized_responses_are_rejected_without_reading_payload() {
        use axum::routing::get;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                axum::Router::new().route("/", get(|| async { vec![0u8; MAX_RESPONSE_BYTES + 1] })),
            )
            .await
            .unwrap();
        });
        let response = pinned_client("localhost", &[address])
            .unwrap()
            .get(format!("http://{address}/"))
            .send()
            .await
            .unwrap();
        assert!(matches!(
            read_response(response).await,
            Err(TransportError::ResponseTooLarge)
        ));
        server.abort();
    }

    #[tokio::test]
    async fn rejected_targets_never_start_a_request() {
        let result = ProviderOrigin::Icloud
            .request(
                Method::GET,
                "http://127.0.0.1:1/",
                None,
                HeaderMap::new(),
                None,
            )
            .await;
        assert!(matches!(result, Err(TransportError::DisallowedTarget)));
    }
}
