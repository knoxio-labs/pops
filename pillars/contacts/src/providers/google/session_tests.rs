use super::*;
use crate::providers::google::oauth::CONTACTS_READ_ONLY;
use crate::providers::transport::{
    ProviderOrigin, ProviderRequest, ProviderResponse, ProviderResponseFuture, TransportError,
};
use reqwest::{header::HeaderMap, StatusCode};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Default)]
struct Delay(Mutex<Vec<Duration>>);
impl RetryDelay for Delay {
    fn wait(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        self.0.lock().unwrap().push(duration);
        Box::pin(async {})
    }
}
struct Fake(Mutex<VecDeque<(ProviderOrigin, u16, Value)>>);
impl ProviderTransport for Fake {
    fn send<'a>(&'a self, request: ProviderRequest<'a>) -> ProviderResponseFuture<'a> {
        Box::pin(async move {
            let (origin, status, body) = self
                .0
                .lock()
                .unwrap()
                .pop_front()
                .ok_or(TransportError::Unavailable)?;
            assert_eq!(origin, request.origin);
            ProviderResponse::new(
                StatusCode::from_u16(status).unwrap(),
                HeaderMap::new(),
                body.to_string().into_bytes(),
            )
        })
    }
}
fn secret() -> SecretBytes {
    SecretBytes::new(vec![b'x'; 20]).unwrap()
}
fn config() -> GoogleOAuthConfig {
    GoogleOAuthConfig::new(
        "fictional".to_string(),
        secret(),
        "https://contacts.example.test/providers/google/callback",
    )
    .unwrap()
}
fn tokens(expires_at: u64) -> GoogleTokens {
    GoogleTokens {
        access_token: secret(),
        refresh_token: secret(),
        expires_at,
    }
}
fn refreshed() -> Value {
    json!({"access_token":"synthetic-access","refresh_token":"synthetic-rotated-refresh","token_type":"Bearer","expires_in":3600,"scope":CONTACTS_READ_ONLY})
}

#[tokio::test]
async fn expired_access_refreshes_before_fetch_and_retains_rotated_refresh_material() {
    let transport = Fake(Mutex::new(
        vec![
            (ProviderOrigin::GoogleToken, 200, refreshed()),
            (
                ProviderOrigin::GooglePeople,
                200,
                json!({"nextSyncToken":"done"}),
            ),
        ]
        .into(),
    ));
    let config = config();
    let delay = Delay::default();
    let mut session = GoogleSession::new(&config, &transport, &delay, tokens(100));
    session.page(None, None, 101).await.unwrap();
    assert_eq!(
        session.refresh_token().expose(),
        b"synthetic-rotated-refresh"
    );
    assert!(transport.0.lock().unwrap().is_empty());
    assert!(delay.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn api_401_refreshes_once_and_repeated_401_stops() {
    let transport = Fake(Mutex::new(
        vec![
            (ProviderOrigin::GooglePeople, 401, json!({})),
            (ProviderOrigin::GoogleToken, 200, refreshed()),
            (ProviderOrigin::GooglePeople, 401, json!({})),
        ]
        .into(),
    ));
    let config = config();
    let delay = Delay::default();
    let mut session = GoogleSession::new(&config, &transport, &delay, tokens(5000));
    assert!(matches!(
        session.page(None, None, 100).await,
        Err(GoogleError::ReauthorizationRequired)
    ));
    assert!(transport.0.lock().unwrap().is_empty());
    assert_eq!(
        session.refresh_token().expose(),
        b"synthetic-rotated-refresh"
    );
}

#[tokio::test]
async fn revoked_grant_stops_before_people_and_does_not_retry() {
    let transport = Fake(Mutex::new(
        vec![(
            ProviderOrigin::GoogleToken,
            400,
            json!({"error":"invalid_grant"}),
        )]
        .into(),
    ));
    let config = config();
    let delay = Delay::default();
    let mut session = GoogleSession::new(&config, &transport, &delay, tokens(0));
    assert!(matches!(
        session.page(None, None, 100).await,
        Err(GoogleError::ReauthorizationRequired)
    ));
    assert!(transport.0.lock().unwrap().is_empty());
    assert!(delay.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn transient_retry_has_an_attempt_budget_and_bounded_backoff() {
    let delay = Delay::default();
    let mut calls = 0;
    let result: Result<(), _> = retry(&delay, || {
        calls += 1;
        async { Err(GoogleError::Retryable(Duration::ZERO)) }
    })
    .await;
    assert_eq!(result, Err(GoogleError::Retryable(Duration::ZERO)));
    assert_eq!(calls, 3);
    assert_eq!(
        *delay.0.lock().unwrap(),
        vec![Duration::from_secs(1), Duration::from_secs(2)]
    );
    delay.0.lock().unwrap().clear();
    let _: Result<(), _> = retry(&delay, || async {
        Err(GoogleError::Retryable(Duration::from_secs(1000)))
    })
    .await;
    assert_eq!(*delay.0.lock().unwrap(), vec![Duration::from_secs(60); 2]);
}

#[tokio::test]
async fn other_contacts_cannot_be_requested_without_persisted_consent() {
    let transport = Fake(Mutex::new(VecDeque::new()));
    let config = config();
    let delay = Delay::default();
    let mut session = GoogleSession::new(&config, &transport, &delay, tokens(5000));
    assert!(matches!(
        session.other_contacts_page(None, None, 100).await,
        Err(GoogleError::ScopeDenied)
    ));
    assert!(transport.0.lock().unwrap().is_empty());
}
