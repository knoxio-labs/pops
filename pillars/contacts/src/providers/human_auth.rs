//! Explicit human Access authentication for credential administration.

use super::transport::{valid_team_name, ProviderOrigin};
use axum::http::HeaderMap;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::Method;
use ring::signature::{RsaPublicKeyComponents, RSA_PKCS1_2048_8192_SHA256};
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use zeroize::Zeroizing;

/// A sanitized authentication failure without JWTs, claims or network details.
#[derive(Debug, PartialEq, Eq)]
pub enum HumanAuthError {
    /// Access team, audience or operator allowlist is absent or invalid.
    Unconfigured,
    /// The request lacks a valid human session for this application.
    Unauthorized,
    /// A verified human is outside the configured operator allowlist.
    Forbidden,
    /// Signing keys could not be fetched or parsed; admission fails closed.
    Unavailable,
}

impl std::fmt::Display for HumanAuthError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Unconfigured => "CONTACTS_PROVIDER_HUMAN_AUTH_UNCONFIGURED",
            Self::Unauthorized => "CONTACTS_PROVIDER_HUMAN_SESSION_REQUIRED",
            Self::Forbidden => "CONTACTS_PROVIDER_OPERATOR_REQUIRED",
            Self::Unavailable => "CONTACTS_PROVIDER_HUMAN_AUTH_UNAVAILABLE",
        })
    }
}

impl std::error::Error for HumanAuthError {}

/// Verified operator identity. Fields cannot be constructed from unverified input;
/// no Debug/Serialize implementation exposes identity through diagnostics.
pub struct HumanIdentity {
    subject: String,
}

impl HumanIdentity {
    #[cfg(test)]
    pub(super) fn for_test(subject: &str) -> Self {
        Self {
            subject: subject.to_string(),
        }
    }

    /// Stable Access subject used to bind one-use authorization state.
    pub fn subject(&self) -> &str {
        &self.subject
    }
}

/// Application-bound RS256 verifier with cached, fixed-origin signing keys.
/// Missing configuration never admits a local, development or tunnel bypass.
#[derive(Clone)]
pub struct HumanAccessVerifier {
    issuer: String,
    audience: String,
    operators: HashSet<String>,
    cache: Arc<Mutex<Option<CachedKeys>>>,
    refresh: Arc<Mutex<()>>,
}

struct CachedKeys {
    keys: Arc<Jwks>,
    expires: Instant,
    miss_refreshed_at: Option<Instant>,
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct Jwk {
    kid: String,
    kty: String,
    alg: Option<String>,
    #[serde(rename = "use")]
    usage: Option<String>,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct JwtHeader {
    alg: String,
    kid: String,
    crit: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Audience {
    One(String),
    Many(Vec<String>),
}

#[derive(Deserialize)]
struct Claims {
    iss: String,
    aud: Audience,
    exp: u64,
    nbf: Option<u64>,
    iat: u64,
    sub: String,
    email: Option<String>,
    common_name: Option<String>,
}

impl HumanAccessVerifier {
    /// Read only non-secret Access configuration. All three settings are
    /// mandatory: team name, application audience, and POPS_OPERATOR_EMAILS.
    pub fn from_env() -> Result<Self, HumanAuthError> {
        let required = |name| std::env::var(name).map_err(|_| HumanAuthError::Unconfigured);
        Self::new(
            &required("CLOUDFLARE_ACCESS_TEAM_NAME")?,
            &required("CLOUDFLARE_ACCESS_AUD")?,
            &required("POPS_OPERATOR_EMAILS")?,
        )
    }

    /// Build a fail-closed verifier from an Access team label, exact audience,
    /// and comma/semicolon-separated operator emails. No arbitrary issuer URL.
    pub fn new(team: &str, audience: &str, operator_emails: &str) -> Result<Self, HumanAuthError> {
        let operators: HashSet<String> = operator_emails
            .split([',', ';'])
            .map(|email| email.trim().to_lowercase())
            .filter(|email| !email.is_empty())
            .collect();
        if !valid_team_name(team)
            || audience.trim().is_empty()
            || audience.len() > 1024
            || operators.is_empty()
            || operators
                .iter()
                .any(|email| !email.contains('@') || email.len() > 320)
        {
            return Err(HumanAuthError::Unconfigured);
        }
        Ok(Self {
            issuer: format!("https://{team}.cloudflareaccess.com"),
            audience: audience.to_string(),
            operators,
            cache: Arc::new(Mutex::new(None)),
            refresh: Arc::new(Mutex::new(())),
        })
    }

    /// Verify the Access assertion and configured operator membership. API-key
    /// requests and Access service-token claims are explicitly excluded.
    pub async fn verify(&self, headers: &HeaderMap) -> Result<HumanIdentity, HumanAuthError> {
        if headers.contains_key("x-api-key") {
            return Err(HumanAuthError::Unauthorized);
        }
        let mut assertions = headers.get_all("cf-access-jwt-assertion").iter();
        let token = assertions
            .next()
            .and_then(|value| value.to_str().ok())
            .ok_or(HumanAuthError::Unauthorized)?;
        if assertions.next().is_some() {
            return Err(HumanAuthError::Unauthorized);
        }
        let header = read_header(token)?;
        let keys = self.signing_keys(&header.kid, || self.fetch_keys()).await?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| HumanAuthError::Unavailable)?
            .as_secs();
        self.verify_with_keys(token, &keys, now)
    }

    async fn fetch_keys(&self) -> Result<Jwks, HumanAuthError> {
        let response = ProviderOrigin::CloudflareAccessKeys
            .request(
                Method::GET,
                &format!("{}/cdn-cgi/access/certs", self.issuer),
                None,
                HeaderMap::new(),
                None,
            )
            .await
            .map_err(|_| HumanAuthError::Unavailable)?;
        if !response.status.is_success() {
            return Err(HumanAuthError::Unavailable);
        }
        let keys = serde_json::from_slice::<Jwks>(response.body())
            .map_err(|_| HumanAuthError::Unavailable)?;
        if keys.keys.is_empty() || keys.keys.len() > 32 {
            return Err(HumanAuthError::Unavailable);
        }
        Ok(keys)
    }

    async fn signing_keys<F, Fut>(&self, kid: &str, fetch: F) -> Result<Arc<Jwks>, HumanAuthError>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<Jwks, HumanAuthError>>,
    {
        if let Some(keys) = self.cached_keys(kid, false).await {
            return Ok(keys);
        }
        let _refresh = self.refresh.lock().await;
        if let Some(keys) = self.cached_keys(kid, true).await {
            return Ok(keys);
        }
        let miss = self
            .cache
            .lock()
            .await
            .as_ref()
            .is_some_and(|entry| entry.expires > Instant::now());
        if miss {
            if let Some(entry) = self.cache.lock().await.as_mut() {
                entry.miss_refreshed_at = Some(Instant::now());
            }
        }
        let keys = Arc::new(fetch().await?);
        *self.cache.lock().await = Some(CachedKeys {
            keys: Arc::clone(&keys),
            expires: Instant::now() + Duration::from_secs(900),
            miss_refreshed_at: if miss { Some(Instant::now()) } else { None },
        });
        Ok(keys)
    }

    async fn cached_keys(&self, kid: &str, rate_limit_miss: bool) -> Option<Arc<Jwks>> {
        let cache = self.cache.lock().await;
        let entry = cache
            .as_ref()
            .filter(|entry| entry.expires > Instant::now())?;
        let known = entry.keys.keys.iter().any(|key| key.kid == kid);
        let recent_miss = rate_limit_miss
            && entry
                .miss_refreshed_at
                .is_some_and(|at| at.elapsed() < Duration::from_secs(30));
        (known || recent_miss).then(|| Arc::clone(&entry.keys))
    }

    fn verify_with_keys(
        &self,
        token: &str,
        keys: &Jwks,
        now: u64,
    ) -> Result<HumanIdentity, HumanAuthError> {
        let header = read_header(token)?;
        let segments: Vec<&str> = token.split('.').collect();
        let [_, payload, signature] = segments.as_slice() else {
            return Err(HumanAuthError::Unauthorized);
        };
        let mut matching = keys.keys.iter().filter(|key| key.kid == header.kid);
        let key = matching.next().ok_or(HumanAuthError::Unauthorized)?;
        if matching.next().is_some()
            || key.kty != "RSA"
            || key.alg.as_deref().is_some_and(|alg| alg != "RS256")
            || key.usage.as_deref().is_some_and(|usage| usage != "sig")
        {
            return Err(HumanAuthError::Unauthorized);
        }
        let modulus = decode(&key.n)?;
        let exponent = decode(&key.e)?;
        let public_key = RsaPublicKeyComponents {
            n: modulus.as_slice(),
            e: exponent.as_slice(),
        };
        let signed_length = token.len() - signature.len() - 1;
        public_key
            .verify(
                &RSA_PKCS1_2048_8192_SHA256,
                &token.as_bytes()[..signed_length],
                &decode(signature)?,
            )
            .map_err(|_| HumanAuthError::Unauthorized)?;
        let claims: Claims =
            serde_json::from_slice(&decode(payload)?).map_err(|_| HumanAuthError::Unauthorized)?;
        let audience_matches = match claims.aud {
            Audience::One(audience) => audience == self.audience,
            Audience::Many(audiences) => audiences.contains(&self.audience),
        };
        if claims.iss != self.issuer
            || !audience_matches
            || claims.exp <= now
            || claims.nbf.is_some_and(|nbf| nbf > now)
            || claims.iat > now
            || claims.sub.is_empty()
            || claims.sub.len() > 512
            || claims.common_name.is_some()
        {
            return Err(HumanAuthError::Unauthorized);
        }
        let email = claims
            .email
            .filter(|email| !email.trim().is_empty())
            .ok_or(HumanAuthError::Unauthorized)?;
        if !self.operators.contains(&email.trim().to_lowercase()) {
            return Err(HumanAuthError::Forbidden);
        }
        Ok(HumanIdentity {
            subject: claims.sub,
        })
    }
}

fn read_header(token: &str) -> Result<JwtHeader, HumanAuthError> {
    if token.len() > 16_384 || token.split('.').count() != 3 {
        return Err(HumanAuthError::Unauthorized);
    }
    let encoded = token
        .split('.')
        .next()
        .ok_or(HumanAuthError::Unauthorized)?;
    let header: JwtHeader =
        serde_json::from_slice(&decode(encoded)?).map_err(|_| HumanAuthError::Unauthorized)?;
    if header.alg != "RS256"
        || header.kid.is_empty()
        || header.crit.as_ref().is_some_and(|crit| !crit.is_empty())
    {
        return Err(HumanAuthError::Unauthorized);
    }
    Ok(header)
}

fn decode(encoded: &str) -> Result<Zeroizing<Vec<u8>>, HumanAuthError> {
    URL_SAFE_NO_PAD
        .decode(encoded)
        .map(Zeroizing::new)
        .map_err(|_| HumanAuthError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[derive(Deserialize)]
    struct Fixtures {
        jwks: Jwks,
        valid: String,
        service: String,
        expired: String,
        wrong_audience: String,
        wrong_issuer: String,
        future: String,
        guest: String,
    }

    fn fixtures() -> Fixtures {
        serde_json::from_str(include_str!("../../tests/fixtures/provider-access.json")).unwrap()
    }

    fn verifier() -> HumanAccessVerifier {
        HumanAccessVerifier::new(
            "synthetic-provider-test",
            "synthetic-audience",
            "operator@example.test",
        )
        .unwrap()
    }

    #[test]
    fn signed_human_requires_exact_issuer_audience_time_and_operator() {
        let fixtures = fixtures();
        let verifier = verifier();
        assert_eq!(
            verifier
                .verify_with_keys(&fixtures.valid, &fixtures.jwks, 1000)
                .unwrap()
                .subject(),
            "synthetic-subject"
        );
        for token in [
            &fixtures.service,
            &fixtures.expired,
            &fixtures.wrong_audience,
            &fixtures.wrong_issuer,
            &fixtures.future,
        ] {
            assert!(matches!(
                verifier.verify_with_keys(token, &fixtures.jwks, 1000),
                Err(HumanAuthError::Unauthorized)
            ));
        }
        assert!(matches!(
            verifier.verify_with_keys(&fixtures.guest, &fixtures.jwks, 1000),
            Err(HumanAuthError::Forbidden)
        ));
        assert!(verifier
            .verify_with_keys(&fixtures.valid, &fixtures.jwks, 2000)
            .is_err());
    }

    #[test]
    fn tampering_algorithm_confusion_and_unknown_keys_fail() {
        let fixtures = fixtures();
        let verifier = verifier();
        let mut segments: Vec<String> = fixtures.valid.split('.').map(String::from).collect();
        segments[1] = URL_SAFE_NO_PAD.encode(br#"{"email":"operator@example.test"}"#);
        assert!(verifier
            .verify_with_keys(&segments.join("."), &fixtures.jwks, 1000)
            .is_err());
        for algorithm in ["none", "HS256", "RS512"] {
            segments[0] =
                URL_SAFE_NO_PAD.encode(format!(r#"{{"alg":"{algorithm}","kid":"synthetic-key"}}"#));
            assert!(verifier
                .verify_with_keys(&segments.join("."), &fixtures.jwks, 1000)
                .is_err());
        }
        assert!(verifier
            .verify_with_keys(&fixtures.valid, &Jwks { keys: vec![] }, 1000)
            .is_err());
        for token in ["", "a.b", "a.b.c.d", "a.b.c"] {
            assert!(verifier
                .verify_with_keys(token, &fixtures.jwks, 1000)
                .is_err());
        }
    }

    #[tokio::test]
    async fn missing_and_service_credentials_never_attempt_key_fetch() {
        let verifier = verifier();
        assert!(matches!(
            verifier.verify(&HeaderMap::new()).await,
            Err(HumanAuthError::Unauthorized)
        ));
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("synthetic"));
        assert!(matches!(
            verifier.verify(&headers).await,
            Err(HumanAuthError::Unauthorized)
        ));
        assert!(verifier.cache.lock().await.is_none());
    }

    #[tokio::test]
    async fn unknown_key_refreshes_once_and_repeated_misses_are_rate_limited() {
        let verifier = verifier();
        verifier
            .signing_keys("synthetic-key", || async { Ok(fixtures().jwks) })
            .await
            .unwrap();
        let rotated = verifier
            .signing_keys("rotated-key", || async {
                let mut keys = fixtures().jwks;
                keys.keys[0].kid = "rotated-key".to_string();
                Ok(keys)
            })
            .await
            .unwrap();
        assert_eq!(rotated.keys[0].kid, "rotated-key");
        let cached = verifier
            .signing_keys("unknown-key", || async { Err(HumanAuthError::Unavailable) })
            .await
            .unwrap();
        assert_eq!(cached.keys[0].kid, "rotated-key");
    }

    #[tokio::test]
    async fn known_keys_remain_available_during_a_rotation_fetch() {
        let verifier = verifier();
        verifier
            .signing_keys("synthetic-key", || async { Ok(fixtures().jwks) })
            .await
            .unwrap();
        let started = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let refreshing = verifier.clone();
        let task_started = Arc::clone(&started);
        let task_release = Arc::clone(&release);
        let refresh = tokio::spawn(async move {
            refreshing
                .signing_keys("rotated-key", || async {
                    task_started.notify_one();
                    task_release.notified().await;
                    Ok(fixtures().jwks)
                })
                .await
        });
        started.notified().await;
        let cached = tokio::time::timeout(
            Duration::from_millis(100),
            verifier.signing_keys("synthetic-key", || async {
                Err(HumanAuthError::Unavailable)
            }),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(cached.keys[0].kid, "synthetic-key");
        release.notify_one();
        assert!(refresh.await.unwrap().is_ok());
    }

    #[test]
    fn missing_configuration_and_untrusted_team_names_fail_closed() {
        for team in [
            "",
            "https://evil.example",
            "a.b",
            "-team",
            "team-",
            "TEAM",
            "127.0.0.1",
        ] {
            assert!(matches!(
                HumanAccessVerifier::new(team, "aud", "operator@example.test"),
                Err(HumanAuthError::Unconfigured)
            ));
        }
        assert!(HumanAccessVerifier::new("team", "", "operator@example.test").is_err());
        assert!(HumanAccessVerifier::new("team", "aud", "").is_err());
    }
}
