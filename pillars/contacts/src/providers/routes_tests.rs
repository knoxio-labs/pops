use super::*;
use crate::app::{build_router_with_providers, AppState};
use crate::providers::credentials::CredentialCipher;
use crate::providers::google::session::TokioDelay;
use crate::providers::human_auth::HumanAccessVerifier;
use crate::providers::transport::NetworkTransport;
use crate::service_account_scope::ServiceAccountScopeVerifier;
use axum::body::{to_bytes, Body};
use axum::http::{Method, Request};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn registry(headers: HeaderMap) -> Response {
    let scopes = match headers
        .get("x-api-key")
        .and_then(|header| header.to_str().ok())
    {
        Some("fictional-sync") => vec!["contacts.providers.sync"],
        Some("fictional-admin") => vec!["contacts.providers"],
        Some("fictional-health") => vec!["contacts.health"],
        _ => return StatusCode::UNAUTHORIZED.into_response(),
    };
    Json(json!({"id":"fictional-service","name":"Fictional","scopes":scopes})).into_response()
}
async fn setup(enabled: bool) -> (Router, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new().route("/service-accounts/self", get(registry)),
        )
        .await
        .unwrap()
    });
    let state = AppState {
        pool: crate::db::connect("sqlite::memory:").await.unwrap(),
        version: "test".into(),
        service_account_scope_verifier: ServiceAccountScopeVerifier::new(format!(
            "http://{address}"
        ))
        .unwrap(),
    };
    let extension = enabled.then(|| {
        Arc::new(ProviderRuntime::new(
            CredentialCipher::for_test(),
            HumanAccessVerifier::new("fictional", "audience", "operator@example.test").unwrap(),
            None,
            Arc::new(NetworkTransport),
            Arc::new(TokioDelay),
        ))
    });
    (build_router_with_providers(state, extension), server)
}
async fn request(
    router: &Router,
    method: Method,
    path: &str,
    key: Option<&str>,
    assertion: Option<&str>,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(key) = key {
        request = request.header("x-api-key", key);
    }
    if let Some(assertion) = assertion {
        request = request.header("cf-access-jwt-assertion", assertion);
    }
    let response = router
        .clone()
        .oneshot(request.body(Body::from("{}")).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 8192).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn missing_configuration_disables_connections_without_disabling_health() {
    let (router, server) = setup(false).await;
    let (status, body) = request(&router, Method::GET, "/providers/accounts", None, None).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body["code"], "contacts.provider.unavailable");
    assert_eq!(
        request(&router, Method::GET, "/health", None, None).await.0,
        StatusCode::OK
    );
    server.abort();
}

#[tokio::test]
async fn management_requires_verified_human_and_excludes_scoped_service_credentials() {
    let (router, server) = setup(true).await;
    for (method, path) in [
        (Method::GET, "/providers/accounts"),
        (Method::POST, "/providers/google/authorize"),
        (
            Method::GET,
            "/providers/google/callback?code=fictional&state=fictional",
        ),
        (Method::POST, "/providers/icloud/accounts"),
        (Method::DELETE, "/providers/accounts/fictional"),
    ] {
        assert_eq!(
            request(&router, method.clone(), path, None, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            request(&router, method.clone(), path, Some("fictional-admin"), None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        let (status, body) = request(
            &router,
            method,
            path,
            None,
            Some("fictional-invalid-assertion"),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(!body.to_string().contains("fictional-invalid-assertion"));
    }
    server.abort();
}

#[tokio::test]
async fn sync_requires_a_verified_scoped_service_or_human_instead_of_absent_api_key() {
    let (router, server) = setup(true).await;
    for (method, path) in [
        (Method::POST, "/providers/accounts/fictional/sync"),
        (Method::GET, "/providers/sync/fictional"),
    ] {
        assert_eq!(
            request(&router, method.clone(), path, None, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            request(
                &router,
                method.clone(),
                path,
                Some("fictional-invalid"),
                None
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            request(
                &router,
                method.clone(),
                path,
                Some("fictional-health"),
                None
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        let (status, body) = request(&router, method, path, Some("fictional-sync"), None).await;
        assert!(matches!(
            status,
            StatusCode::NOT_FOUND | StatusCode::CONFLICT
        ));
        assert!(body["requestId"].is_string());
    }
    server.abort();
}

#[test]
fn callback_allows_google_metadata_without_accepting_missing_or_duplicate_state() {
    assert!(serde_json::from_value::<GoogleCallback>(json!({"code":"fictional-code","state":"fictional-state","scope":"ignored","authuser":"0","prompt":"consent"})).is_ok());
    assert!(serde_json::from_value::<GoogleCallback>(json!({"code":"fictional-code"})).is_err());
}

#[tokio::test]
async fn callback_errors_are_not_cached_and_send_no_referrer() {
    let (router, server) = setup(true).await;
    let response = router
        .oneshot(
            Request::builder()
                .uri("/providers/google/callback?code=fictional&state=fictional")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    server.abort();
}

#[test]
fn authorization_creation_preserves_location_without_triggering_a_fetch_redirect() {
    let config = crate::providers::google::oauth::GoogleOAuthConfig::new(
        "fictional".into(),
        SecretBytes::new(vec![b'x'; 20]).unwrap(),
        "https://contacts.example.test/providers/google/callback",
    )
    .unwrap();
    let location = config
        .authorization_location(&SecretBytes::new(vec![b's'; 43]).unwrap(), &"c".repeat(43))
        .unwrap();
    let response = authorization_response(&location).unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    assert!(response.headers()["location"].is_sensitive());
    assert!(response.headers()["location"]
        .to_str()
        .unwrap()
        .starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert_eq!(response.headers()["cache-control"], "no-store");
}
