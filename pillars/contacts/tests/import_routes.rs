//! Import HTTP envelopes, service-account scopes and byte limits.

mod common;

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::routing::get;
use contacts::app::{build_router, AppState};
use contacts::db;
use contacts::imports::parser::MAX_FILE_BYTES;
use contacts::service_account_scope::ServiceAccountScopeVerifier;
use contacts::sources::model::SourceAccountInput;
use contacts::sources::repo::create_or_get_account;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;

async fn setup() -> (axum::Router, SqlitePool, String) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let account = create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "personal".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let router = build_router(AppState {
        pool: pool.clone(),
        version: "test".into(),
        service_account_scope_verifier: common::service_account_scope_verifier(),
    });
    (router, pool, account.id)
}

async fn send(
    router: &axum::Router,
    method: &str,
    uri: &str,
    content_type: &str,
    body: Vec<u8>,
    api_key: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", content_type);
    if let Some(key) = api_key {
        builder = builder.header("x-api-key", key);
    }
    let response = router
        .clone()
        .oneshot(builder.body(Body::from(body)).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

async fn stage(router: &axum::Router, account: &str) -> Value {
    let (status, body) = send(
        router,
        "POST",
        &format!("/imports/files?accountId={account}&collectionKey=personal&format=vcard"),
        "application/octet-stream",
        b"BEGIN:VCARD\nVERSION:4.0\nFN:Person\nUID:stable\nEND:VCARD\n".to_vec(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body
}

#[tokio::test]
async fn upload_preview_and_commit_routes_preserve_receipts_and_conflict_codes() {
    let (router, pool, account) = setup().await;
    let batch = stage(&router, &account).await;
    let id = batch["id"].as_str().unwrap();
    let request = json!({"revision":1,"idempotencyKey":"commit","decisions":[{"rowId":batch["rows"][0]["id"],"decision":{"action":"create_person"}}]});
    let uri = format!("/imports/{id}/commit");
    let (status, receipt) = send(
        &router,
        "POST",
        &uri,
        "application/json",
        request.to_string().into_bytes(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{receipt}");
    let (status, replay) = send(
        &router,
        "POST",
        &uri,
        "application/json",
        request.to_string().into_bytes(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(receipt, replay);
    let (status, preview) = send(
        &router,
        "GET",
        &format!("/imports/{id}"),
        "application/json",
        Vec::new(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview["revision"], 2);
    assert_eq!(preview["rows"][0]["processed"], true);
    let different = json!({"revision":1,"idempotencyKey":"different","decisions":[{"rowId":batch["rows"][0]["id"],"decision":{"action":"skip"}}]});
    let (status, conflict) = send(
        &router,
        "POST",
        &uri,
        "application/json",
        different.to_string().into_bytes(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(conflict["code"], "contacts.import.conflict");
    assert!(conflict["requestId"].is_string());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn malformed_uploads_are_durable_and_invalid_http_inputs_never_echo_values() {
    let (router, pool, account) = setup().await;
    let uri = format!("/imports/files?accountId={account}&collectionKey=personal&format=vcard");
    let (status, failed) = send(
        &router,
        "POST",
        &uri,
        "application/octet-stream",
        b"BEGIN:VCARD\nFN:private uploaded value".to_vec(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(failed["rows"][0]["proposal"], "invalid");
    assert!(failed["rows"][0]["errors"]
        .as_array()
        .unwrap()
        .contains(&json!("malformed_record")));
    assert!(!failed.to_string().contains("private uploaded value"));
    let (status, error) = send(
        &router,
        "POST",
        "/imports/files?format=private-query-value",
        "application/octet-stream",
        Vec::new(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!error.to_string().contains("private-query-value"));
    let (status, error) = send(
        &router,
        "POST",
        "/imports/missing/commit",
        "application/json",
        br#"{"revision":"private-body-value"}"#.to_vec(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!error.to_string().contains("private-body-value"));
    let (status, error) = send(
        &router,
        "POST",
        &uri,
        "application/octet-stream",
        vec![b'x'; MAX_FILE_BYTES + 1],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(error["requestId"].is_string());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn storage_errors_use_safe_classification_with_no_database_context() {
    let (router, pool, account) = setup().await;
    let batch = stage(&router, &account).await;
    sqlx::query("CREATE TRIGGER fail_import BEFORE INSERT ON source_records BEGIN SELECT RAISE(ABORT,'private database observation'); END").execute(&pool).await.unwrap();
    let request = json!({"revision":1,"idempotencyKey":"commit","decisions":[{"rowId":batch["rows"][0]["id"],"decision":{"action":"create_person"}}]});
    let (status, error) = send(
        &router,
        "POST",
        &format!("/imports/{}/commit", batch["id"].as_str().unwrap()),
        "application/json",
        request.to_string().into_bytes(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(error["code"], "contacts.import.storage");
    assert_eq!(error["retryable"], true);
    assert!(!error.to_string().contains("private database observation"));
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn upload_phone_country_context_reaches_every_phone_and_rejects_unknown_codes() {
    let (router, pool, account) = setup().await;
    let uri = format!("/imports/files?accountId={account}&collectionKey=personal&format=vcard&phoneCountryCode=AU");
    let bytes = b"BEGIN:VCARD\nVERSION:4.0\nFN:Person\nTEL;TYPE=CELL:0412345678\nTEL;TYPE=HOME:+61498765432\nEMAIL:person@example.test\nEND:VCARD\n".to_vec();
    let (status, batch) = send(
        &router,
        "POST",
        &uri,
        "application/octet-stream",
        bytes.clone(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{batch}");
    let points = batch["rows"][0]["payload"]["points"].as_array().unwrap();
    assert_eq!(
        points
            .iter()
            .filter(|point| point["kind"] == "phone")
            .count(),
        2
    );
    for point in points {
        if point["kind"] == "phone" {
            assert_eq!(point["countryCode"], "AU");
        } else {
            assert!(point["countryCode"].is_null());
        }
    }
    let body = json!({"revision":1,"idempotencyKey":"country-context","decisions":[{"rowId":batch["rows"][0]["id"],"decision":{"action":"create_person"}}]});
    let (status, receipt) = send(
        &router,
        "POST",
        &format!("/imports/{}/commit", batch["id"].as_str().unwrap()),
        "application/json",
        body.to_string().into_bytes(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{receipt}");
    let entity = receipt["rows"][0]["entityId"].as_str().unwrap();
    let stored: Vec<(String, String, String)> = sqlx::query_as("SELECT value,country_code,normalized_value FROM contact_points WHERE entity_id=?1 AND kind='phone' ORDER BY normalized_value")
        .bind(entity).fetch_all(&pool).await.unwrap();
    assert_eq!(
        stored,
        vec![
            (
                "0412345678".to_string(),
                "AU".to_string(),
                "+61412345678".to_string()
            ),
            (
                "+61498765432".to_string(),
                "AU".to_string(),
                "+61498765432".to_string()
            )
        ]
    );
    for country in ["ZZ", "AUS"] {
        let invalid = format!("/imports/files?accountId={account}&collectionKey=personal&format=vcard&phoneCountryCode={country}");
        let (status, error) = send(
            &router,
            "POST",
            &invalid,
            "application/octet-stream",
            bytes.clone(),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error["code"], "contacts.request.invalid");
    }
}

async fn registry_account(State(()): State<()>, headers: HeaderMap) -> axum::Json<Value> {
    let imports = headers
        .get("x-api-key")
        .is_some_and(|value| value == "imports-test");
    axum::Json(
        json!({"id":"test-account","name":"Test","scopes":if imports {vec!["contacts.imports"]} else {vec!["contacts.entities"]}}),
    )
}

#[tokio::test]
async fn import_operations_require_their_published_service_account_scope() {
    let (_, pool, account) = setup().await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            axum::Router::new()
                .route("/service-accounts/self", get(registry_account))
                .with_state(()),
        )
        .await
        .unwrap();
    });
    let router = build_router(AppState {
        pool,
        version: "test".into(),
        service_account_scope_verifier: ServiceAccountScopeVerifier::new(format!(
            "http://{address}"
        ))
        .unwrap(),
    });
    let uri = format!("/imports/files?accountId={account}&collectionKey=personal&format=vcard");
    let bytes = b"BEGIN:VCARD\nVERSION:4.0\nFN:Person\nEND:VCARD\n".to_vec();
    let (status, _) = send(
        &router,
        "POST",
        &uri,
        "application/octet-stream",
        bytes.clone(),
        Some("entities-test"),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, batch) = send(
        &router,
        "POST",
        &uri,
        "application/octet-stream",
        bytes,
        Some("imports-test"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{batch}");
    let (status, _) = send(
        &router,
        "GET",
        &format!("/imports/{}", batch["id"].as_str().unwrap()),
        "application/json",
        Vec::new(),
        Some("imports-test"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    for (key, expected) in [
        ("entities-test", StatusCode::FORBIDDEN),
        ("imports-test", StatusCode::BAD_REQUEST),
    ] {
        let (status, _) = send(
            &router,
            "POST",
            "/imports/missing/review-decisions",
            "application/json",
            b"{}".to_vec(),
            Some(key),
        )
        .await;
        assert_eq!(status, expected);
    }
    server.abort();
}

#[test]
fn upload_contract_uses_binary_bytes_and_camel_case_query_parameters() {
    let doc = contacts::openapi::openapi_30_value();
    let operation = &doc["paths"]["/imports/files"]["post"];
    assert_eq!(
        operation["requestBody"]["content"]["application/octet-stream"]["schema"]["format"],
        "binary"
    );
    let params = operation["parameters"].as_array().unwrap();
    assert!(params.iter().all(|param| param["in"] == "query"));
    for name in ["encoding", "phoneCountryCode"] {
        assert_eq!(
            params.iter().find(|param| param["name"] == name).unwrap()["required"],
            false
        );
    }
    assert!(params.iter().any(|param| param["name"] == "accountId"));
    assert!(params.iter().any(|param| param["name"] == "collectionKey"));
    assert!(params
        .iter()
        .any(|param| param["name"] == "phoneCountryCode"));
}

#[tokio::test]
async fn review_decision_contract_is_scoped_bounded_and_rejects_malformed_input() {
    let (router, _, _) = setup().await;
    let (status, _) = send(
        &router,
        "POST",
        "/imports/missing/review-decisions",
        "application/json",
        b"{}".to_vec(),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = send(
        &router,
        "POST",
        "/imports/missing/review-decisions",
        "application/json",
        vec![b' '; 128 * 1024 + 1],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let spec = contacts::openapi::openapi_30_value();
    let operation = &spec["paths"]["/imports/{id}/review-decisions"]["post"];
    assert_eq!(operation["operationId"], "imports.review.decide");
    let receipt = &spec["components"]["schemas"]["ReviewDecisionReceipt"];
    for field in ["entityId", "operationId"] {
        assert!(receipt["required"]
            .as_array()
            .unwrap()
            .contains(&json!(field)));
        assert_eq!(receipt["properties"][field]["nullable"], true);
    }
}
