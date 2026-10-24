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
    assert!(serde_json::from_value::<GoogleCallback>(
        json!({"error":"access_denied","state":"fictional-state"})
    )
    .is_ok());
    assert!(Query::<GoogleCallback>::try_from_uri(
        &"/providers/google/callback?code=one&state=one&state=two"
            .parse()
            .unwrap()
    )
    .is_err());
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
    assert!(!response.headers().contains_key("location"));
    server.abort();
}

#[tokio::test]
async fn callback_completion_redirects_only_success_to_the_fixed_connections_route() {
    let response = callback_response(Ok(CallbackOutcome::Connected), true).unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers()["location"], "/contacts/connections");
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    assert!(to_bytes(response.into_body(), 8192)
        .await
        .unwrap()
        .is_empty());

    let response = callback_response(Err(api(ProviderError::Conflict)), false)
        .unwrap_err()
        .into_response();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(!response.headers().contains_key("location"));
    let body = to_bytes(response.into_body(), 8192).await.unwrap();
    let error: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(error["code"], "contacts.provider.conflict");
}

#[tokio::test]
async fn browser_callback_failures_return_generic_codes_while_json_retains_errors() {
    for accept in [
        "text/html",
        "text/html,application/xhtml+xml;q=0.9",
        "TEXT/HTML;q=0.8",
    ] {
        let mut headers = HeaderMap::new();
        headers.insert("accept", HeaderValue::from_str(accept).unwrap());
        assert!(browser_callback(&headers));
        let response = callback_response(
            Err(api(ProviderError::Conflict)),
            browser_callback(&headers),
        )
        .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(
            response.headers()["location"],
            "/contacts/connections?connectionError=failed"
        );
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    }
    for accept in [
        "application/json",
        "*/*",
        "text/html;q=0",
        "text/html;q=invalid",
    ] {
        let mut headers = HeaderMap::new();
        headers.insert("accept", HeaderValue::from_str(accept).unwrap());
        assert!(!browser_callback(&headers));
        assert!(callback_response(
            Err(api(ProviderError::Conflict)),
            browser_callback(&headers)
        )
        .is_err());
    }
    let (router, server) = setup(true).await;
    let response = router.oneshot(Request::builder()
        .uri("/providers/google/callback?error=access_denied&state=fictional&error_description=sensitive-provider-text")
        .header("accept", "text/html")
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers()["location"],
        "/contacts/connections?connectionError=failed"
    );
    server.abort();
}

#[tokio::test]
async fn denied_browser_consent_consumes_state_and_preserves_credentials_with_replay_fences() {
    use crate::providers::{oauth_state, store};
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let human = HumanIdentity::for_test("operator");
    let other = HumanIdentity::for_test("different-operator");
    let runtime = ProviderRuntime::new(
        CredentialCipher::for_test(),
        HumanAccessVerifier::new("fictional", "audience", "operator@example.test").unwrap(),
        None,
        Arc::new(NetworkTransport),
        Arc::new(TokioDelay),
    );
    let id = crate::sources::repo::create_or_get_account(
        &pool,
        &crate::sources::model::SourceAccountInput {
            provider: "google".into(),
            account_key: "people/fictional".into(),
            label: None,
        },
    )
    .await
    .unwrap()
    .id;
    let epoch = store::prepare_account(&pool, &human, &id).await.unwrap();
    let credential = SecretBytes::new(b"fictional-refresh-material".to_vec()).unwrap();
    let epoch = store::install_credential(&pool, &runtime.cipher, &human, &id, epoch, &credential)
        .await
        .unwrap();
    let attempt =
        oauth_state::begin_authorization(&pool, &runtime.cipher, &human, &id, epoch, 1000)
            .await
            .unwrap();
    let denial = || GoogleCallback {
        code: None,
        error: Some("access_denied".into()),
        state: SecretBytes::new(attempt.state.expose().to_vec()).unwrap(),
    };

    let wrong = complete_authorized_callback(&runtime, &pool, &other, denial(), 1001).await;
    assert!(wrong.is_err());
    let result = complete_authorized_callback(&runtime, &pool, &human, denial(), 1001).await;
    let response = callback_response(result, true).unwrap();
    assert_eq!(
        response.headers()["location"],
        "/contacts/connections?connectionError=cancelled"
    );
    let replay = complete_authorized_callback(&runtime, &pool, &human, denial(), 1002).await;
    let response = callback_response(replay, true).unwrap();
    assert_eq!(
        response.headers()["location"],
        "/contacts/connections?connectionError=failed"
    );

    let expired =
        oauth_state::begin_authorization(&pool, &runtime.cipher, &human, &id, epoch, 1000)
            .await
            .unwrap();
    let result = complete_authorized_callback(
        &runtime,
        &pool,
        &human,
        GoogleCallback {
            code: None,
            error: Some("access_denied".into()),
            state: expired.state,
        },
        1600,
    )
    .await;
    let response = callback_response(result, true).unwrap();
    assert_eq!(
        response.headers()["location"],
        "/contacts/connections?connectionError=failed"
    );
    let result = complete_authorized_callback(
        &runtime,
        &pool,
        &human,
        GoogleCallback {
            code: None,
            error: Some("access_denied".into()),
            state: SecretBytes::new(vec![b'!'; 43]).unwrap(),
        },
        1001,
    )
    .await;
    assert!(callback_response(result, false).is_err());
    assert!(callback_response(Ok(CallbackOutcome::Cancelled), false).is_err());
    let loaded = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert_eq!(loaded.epoch, epoch);
    assert_eq!(loaded.secret.expose(), credential.expose());
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

#[tokio::test]
async fn account_status_discovers_worker_runs_and_keeps_previews_visible_during_later_failures() {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let human = crate::providers::human_auth::HumanIdentity::for_test("operator");
    let id = crate::sources::repo::create_or_get_account(
        &pool,
        &crate::sources::model::SourceAccountInput {
            provider: "google".into(),
            account_key: "people/fictional".into(),
            label: None,
        },
    )
    .await
    .unwrap()
    .id;
    let epoch = crate::providers::store::prepare_account(&pool, &human, &id)
        .await
        .unwrap();
    let epoch = crate::providers::store::install_credential(
        &pool,
        &CredentialCipher::for_test(),
        &human,
        &id,
        epoch,
        &SecretBytes::new(vec![b'x'; 20]).unwrap(),
    )
    .await
    .unwrap();
    let initial = account_statuses(&pool).await.unwrap().remove(0);
    assert!(initial.latest_run_id.is_none());
    assert!(initial.preview_run_id.is_none());
    let complete = crate::providers::sync::begin_sync(&pool, &id, epoch, &[])
        .await
        .unwrap();
    crate::providers::sync::finalize_sync(&pool, &complete.id)
        .await
        .unwrap();
    let pending = crate::providers::sync::begin_sync(&pool, &id, epoch, &[])
        .await
        .unwrap();
    let status = account_statuses(&pool).await.unwrap().remove(0);
    assert_eq!(status.latest_run_id.as_deref(), Some(pending.id.as_str()));
    assert_eq!(status.preview_run_id.as_deref(), Some(complete.id.as_str()));
    crate::providers::sync::abort_sync(
        &pool,
        &pending.id,
        crate::providers::sync::SyncError::InvalidPage,
    )
    .await
    .unwrap();
    let status = account_statuses(&pool).await.unwrap().remove(0);
    assert_eq!(status.latest_run_id.as_deref(), Some(pending.id.as_str()));
    assert_eq!(status.preview_run_id.as_deref(), Some(complete.id.as_str()));
}
