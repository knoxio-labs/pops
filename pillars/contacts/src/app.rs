//! Router assembly + shared application state.

use axum::http::header::CONTENT_TYPE;
use axum::middleware;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use sqlx::SqlitePool;

use crate::health::{health, root};
use crate::openapi::openapi_30_json;
use crate::service_account_scope::{
    enforce_service_account_scope, ServiceAccountScopeGate, ServiceAccountScopeVerifier,
};

/// State shared across handlers. `Clone` is cheap — the pool is an `Arc`
/// internally and the version is a small owned string.
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub version: String,
    /// Registry-backed verifier shared by the contacts request middleware.
    pub service_account_scope_verifier: ServiceAccountScopeVerifier,
}

/// `GET /openapi` — serve the pinned 3.0.3 OpenAPI document.
#[utoipa::path(
    get,
    path = "/openapi",
    operation_id = "openapi.get",
    responses((status = 200, description = "The contacts OpenAPI document", body = serde_json::Value))
)]
pub(crate) async fn openapi_document() -> impl IntoResponse {
    ([(CONTENT_TYPE, "application/json")], openapi_30_json())
}

/// Build the contacts router with service-account scopes derived from OpenAPI
/// operation IDs and registry verification applied to credentialled requests.
pub fn build_router(state: AppState) -> Router {
    let scope_gate = ServiceAccountScopeGate::from_openapi(
        state.service_account_scope_verifier.clone(),
        &openapi_30_json(),
    )
    .expect("contacts OpenAPI operations define the scope gate route map");

    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/openapi", get(openapi_document))
        .merge(crate::entities::router())
        .merge(crate::entities::addresses_routes::router())
        .merge(crate::search::router())
        .with_state(state)
        .layer(middleware::from_fn_with_state(
            scope_gate,
            enforce_service_account_scope,
        ))
        .layer(middleware::from_fn(crate::api::request_id_layer))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use axum::body::Body;
    use axum::extract::State;
    use axum::http::{HeaderMap, Method, Request, StatusCode};
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::task::JoinHandle;
    use tower::ServiceExt;

    #[derive(Clone)]
    struct RegistryMock {
        calls: Arc<AtomicUsize>,
    }

    async fn service_account_self(
        State(state): State<RegistryMock>,
        headers: HeaderMap,
    ) -> Response {
        state.calls.fetch_add(1, Ordering::SeqCst);
        match headers
            .get("x-api-key")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
        {
            "invalid" => StatusCode::UNAUTHORIZED.into_response(),
            "unavailable" => StatusCode::SERVICE_UNAVAILABLE.into_response(),
            "insufficient" => axum::Json(json!({
                "id": "narrow-account",
                "name": "Narrow Account",
                "scopes": ["contacts.entities"]
            }))
            .into_response(),
            "valid" => axum::Json(json!({
                "id": "health-account",
                "name": "Health Account",
                "scopes": ["contacts.health"]
            }))
            .into_response(),
            "entities" => axum::Json(json!({
                "id": "entities-account",
                "name": "Entities Account",
                "scopes": ["contacts.entities"]
            }))
            .into_response(),
            _ => StatusCode::UNAUTHORIZED.into_response(),
        }
    }

    async fn registry_mock() -> (String, Arc<AtomicUsize>, JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind registry test server");
        let address = listener.local_addr().expect("registry test address");
        let calls = Arc::new(AtomicUsize::new(0));
        let app = axum::Router::new()
            .route("/service-accounts/self", get(service_account_self))
            .with_state(RegistryMock {
                calls: Arc::clone(&calls),
            });
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("registry test server");
        });
        (format!("http://{address}"), calls, server)
    }

    async fn test_state(registry_url: &str) -> AppState {
        let pool = db::connect("sqlite::memory:")
            .await
            .expect("in-memory pool for router tests");
        AppState {
            pool,
            version: "0.0.0-test".to_string(),
            service_account_scope_verifier: ServiceAccountScopeVerifier::new(registry_url)
                .expect("test verifier client"),
        }
    }

    async fn request_response(
        router: Router,
        method: Method,
        uri: &str,
        api_key: Option<&str>,
    ) -> Response {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(api_key) = api_key {
            request = request.header("x-api-key", api_key);
        }
        router
            .oneshot(request.body(Body::empty()).expect("health request"))
            .await
            .expect("contacts router response")
    }

    async fn health_response(router: Router, api_key: Option<&str>) -> Response {
        request_response(router, Method::GET, "/health", api_key).await
    }

    #[tokio::test]
    async fn router_builds_without_panicking() {
        let _router = build_router(test_state("http://127.0.0.1:1").await);
    }

    #[tokio::test]
    async fn openapi_document_serves_30_json() {
        let body = openapi_30_json();
        assert!(body.contains("\"3.0.3\""));
    }

    #[tokio::test]
    async fn service_account_requests_follow_registry_identity_and_scope_results() {
        let (registry_url, calls, server) = registry_mock().await;
        let router = build_router(test_state(&registry_url).await);

        assert_eq!(
            health_response(router.clone(), None).await.status(),
            StatusCode::OK
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        assert_eq!(
            health_response(router.clone(), Some("invalid"))
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            health_response(router.clone(), Some("invalid"))
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        assert_eq!(
            health_response(router.clone(), Some("insufficient"))
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            health_response(router.clone(), Some("valid"))
                .await
                .status(),
            StatusCode::OK
        );
        assert_eq!(
            health_response(router.clone(), Some("valid"))
                .await
                .status(),
            StatusCode::OK
        );
        assert_eq!(calls.load(Ordering::SeqCst), 3);

        assert_eq!(
            health_response(router.clone(), Some("unavailable"))
                .await
                .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            health_response(router, Some("unavailable")).await.status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(calls.load(Ordering::SeqCst), 5);

        server.abort();
    }

    #[tokio::test]
    async fn service_account_scopes_cover_parameterized_reads_and_mutations() {
        let (registry_url, calls, server) = registry_mock().await;
        let router = build_router(test_state(&registry_url).await);

        assert_eq!(
            request_response(
                router.clone(),
                Method::GET,
                "/entities/missing",
                Some("entities")
            )
            .await
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            request_response(
                router.clone(),
                Method::DELETE,
                "/entities/missing",
                Some("entities")
            )
            .await
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        let method_not_allowed =
            request_response(router.clone(), Method::DELETE, "/health", Some("invalid")).await;
        assert_eq!(method_not_allowed.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(
            method_not_allowed
                .headers()
                .get(axum::http::header::ALLOW)
                .and_then(|value| value.to_str().ok()),
            Some("GET, HEAD")
        );

        assert_eq!(
            request_response(router, Method::GET, "/missing", Some("invalid"))
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        server.abort();
    }
}
