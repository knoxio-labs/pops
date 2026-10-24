use super::*;
use crate::providers::store::AccountEpoch;
use crate::providers::transport::{ProviderResponse, ProviderResponseFuture};
use std::collections::VecDeque;
use std::sync::Mutex;

struct FakeTransport {
    responses: Mutex<VecDeque<ProviderResponse>>,
    bodies: Mutex<Vec<Zeroizing<Vec<u8>>>>,
}

impl FakeTransport {
    fn responses(responses: Vec<(u16, serde_json::Value)>) -> Self {
        Self {
            responses: Mutex::new(
                responses
                    .into_iter()
                    .map(|(status, body)| {
                        ProviderResponse::new(
                            reqwest::StatusCode::from_u16(status).unwrap(),
                            HeaderMap::new(),
                            body.to_string().into_bytes(),
                        )
                        .unwrap()
                    })
                    .collect(),
            ),
            bodies: Mutex::new(Vec::new()),
        }
    }
}

impl ProviderTransport for FakeTransport {
    fn send<'a>(&'a self, request: ProviderRequest<'a>) -> ProviderResponseFuture<'a> {
        Box::pin(async move {
            assert_eq!(request.origin, ProviderOrigin::GoogleToken);
            assert_eq!(request.url, "https://oauth2.googleapis.com/token");
            assert_eq!(request.method, Method::POST);
            assert!(request.authorization.is_none());
            self.bodies
                .lock()
                .unwrap()
                .push(Zeroizing::new(request.body.unwrap().expose().to_vec()));
            Ok(self
                .responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("queued response"))
        })
    }
}

fn secret(value: &str) -> SecretBytes {
    SecretBytes::new(value.as_bytes().to_vec()).unwrap()
}

fn config() -> GoogleOAuthConfig {
    GoogleOAuthConfig::new(
        "synthetic-client".to_string(),
        secret("synthetic-client-secret"),
        "https://contacts.example.test/providers/google/callback",
    )
    .unwrap()
}

fn consumed() -> ConsumedAuthorization {
    ConsumedAuthorization {
        account_id: "synthetic-account".to_string(),
        epoch: AccountEpoch(1),
        pkce_verifier: secret("synthetic-verifier"),
    }
}

fn token() -> serde_json::Value {
    serde_json::json!({"access_token":"synthetic-access", "refresh_token":"synthetic-refresh", "token_type":"Bearer", "expires_in":3600, "scope":CONTACTS_READ_ONLY})
}

#[test]
fn consent_is_fixed_origin_read_only_offline_and_pkce_bound() {
    let state = secret(&"a".repeat(43));
    let location = config()
        .authorization_location(&state, &"b".repeat(43))
        .unwrap();
    let url = Url::parse(location.expose()).unwrap();
    assert_eq!(
        url.origin().ascii_serialization(),
        "https://accounts.google.com"
    );
    let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
    assert_eq!(pairs["scope"], CONTACTS_READ_ONLY);
    assert_eq!(pairs["access_type"], "offline");
    assert_eq!(pairs["include_granted_scopes"], "false");
    assert_eq!(pairs["code_challenge_method"], "S256");
    assert_eq!(
        pairs["redirect_uri"],
        "https://contacts.example.test/providers/google/callback"
    );
    assert_eq!(pairs["state"].len(), 43);
    for callback in [
        "http://contacts.example.test/providers/google/callback",
        "https://contacts.example.test/elsewhere",
        "https://user:pass@contacts.example.test/providers/google/callback",
        "https://contacts.example.test/providers/google/callback?next=elsewhere",
    ] {
        assert!(GoogleOAuthConfig::new("client".to_string(), secret("secret"), callback).is_err());
    }
}

#[tokio::test]
async fn exchange_sends_encoded_code_and_pkce_and_accepts_only_read_only_grants() {
    let transport = FakeTransport::responses(vec![(200, token())]);
    let tokens = config()
        .exchange_code(&transport, &consumed(), &secret("code+value&x"), None, 1000)
        .await
        .unwrap();
    assert_eq!(tokens.expires_at, 4600);
    assert_eq!(tokens.refresh_token.expose(), b"synthetic-refresh");
    {
        let bodies = transport.bodies.lock().unwrap();
        let fields: std::collections::HashMap<_, _> =
            url::form_urlencoded::parse(&bodies[0]).collect();
        assert_eq!(fields["code"], "code+value&x");
        assert_eq!(fields["code_verifier"], "synthetic-verifier");
        assert_eq!(fields["grant_type"], "authorization_code");
    }
    let mut denied = token();
    denied["scope"] = serde_json::json!("https://www.googleapis.com/auth/contacts");
    let transport = FakeTransport::responses(vec![(200, denied)]);
    assert!(matches!(
        config()
            .exchange_code(&transport, &consumed(), &secret("code"), None, 1000)
            .await,
        Err(GoogleError::ScopeDenied)
    ));
}

#[tokio::test]
async fn omitted_refresh_preserves_existing_credential_on_refresh_and_reauthorization() {
    let mut without_refresh = token();
    without_refresh
        .as_object_mut()
        .unwrap()
        .remove("refresh_token");
    let transport = FakeTransport::responses(vec![
        (200, without_refresh.clone()),
        (200, without_refresh.clone()),
        (200, without_refresh),
    ]);
    let prior = secret("synthetic-prior-refresh");
    assert_eq!(
        config()
            .refresh(&transport, &prior, 1000)
            .await
            .unwrap()
            .refresh_token
            .expose(),
        prior.expose()
    );
    assert_eq!(
        config()
            .exchange_code(&transport, &consumed(), &secret("code"), Some(&prior), 1000)
            .await
            .unwrap()
            .refresh_token
            .expose(),
        prior.expose()
    );
    assert!(matches!(
        config()
            .exchange_code(&transport, &consumed(), &secret("code"), None, 1000)
            .await,
        Err(GoogleError::ReauthorizationRequired)
    ));
}

#[tokio::test]
async fn revoked_grants_rate_limits_and_malformed_responses_are_sanitized() {
    let transport = FakeTransport::responses(vec![
        (
            400,
            serde_json::json!({"error":"invalid_grant","error_description":"sensitive provider text"}),
        ),
        (429, serde_json::json!({})),
        (503, serde_json::json!({})),
        (200, serde_json::json!({"access_token":"synthetic"})),
    ]);
    assert!(matches!(
        config().refresh(&transport, &secret("old"), 1000).await,
        Err(GoogleError::ReauthorizationRequired)
    ));
    assert!(matches!(
        config().refresh(&transport, &secret("old"), 1000).await,
        Err(GoogleError::Retryable(_))
    ));
    assert!(matches!(
        config().refresh(&transport, &secret("old"), 1000).await,
        Err(GoogleError::Retryable(_))
    ));
    assert!(matches!(
        config().refresh(&transport, &secret("old"), 1000).await,
        Err(GoogleError::InvalidResponse)
    ));
    for seconds in [0, 86401, u64::MAX] {
        let mut invalid = token();
        invalid["expires_in"] = serde_json::json!(seconds);
        assert!(matches!(
            parse_tokens(invalid.to_string().as_bytes(), None, true, 1000),
            Err(GoogleError::InvalidResponse)
        ));
    }
    assert_eq!(
        GoogleError::ReauthorizationRequired.to_string(),
        "CONTACTS_GOOGLE_REAUTHORIZATION_REQUIRED"
    );
}
