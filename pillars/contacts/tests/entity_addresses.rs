//! Per-route integration tests for an entity's addresses (ADR-053), driving
//! the fully assembled axum router through `tower::ServiceExt::oneshot`
//! against a migrated in-memory SQLite DB — same shape as `tests/entities.rs`.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use contacts::app::{build_router, AppState};
use contacts::db;

async fn app() -> axum::Router {
    let pool = db::connect("sqlite::memory:")
        .await
        .expect("in-memory pool connects and migrates");
    build_router(AppState {
        pool,
        version: "1.2.3-test".to_string(),
    })
}

async fn send(app: &axum::Router, req: Request<Body>) -> (StatusCode, Value) {
    let response = app.clone().oneshot(req).await.expect("router responds");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body collects")
        .to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("response body is JSON")
    };
    (status, body)
}

fn post(path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get(path: &str) -> Request<Body> {
    Request::builder().uri(path).body(Body::empty()).unwrap()
}

async fn create_entity(app: &axum::Router, name: &str) -> String {
    let (status, body) = send(app, post("/entities", json!({ "name": name }))).await;
    assert_eq!(status, StatusCode::CREATED, "seed entity create: {body}");
    body["data"]["id"].as_str().expect("entity id").to_string()
}

#[tokio::test]
async fn post_then_get_round_trips_an_address() {
    let app = app().await;
    let entity_id = create_entity(&app, "Woolworths").await;

    let (status, body) = send(
        &app,
        post(
            &format!("/entities/{entity_id}/addresses"),
            json!({ "value": "12 Example St" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create returns 201: {body}");
    assert_eq!(body["data"]["value"], "12 Example St");
    assert_eq!(body["data"]["entityId"], entity_id);

    let (status, body) = send(&app, get(&format!("/entities/{entity_id}/addresses"))).await;
    assert_eq!(status, StatusCode::OK);
    let data = body["data"].as_array().expect("data array");
    assert_eq!(data.len(), 1);
    assert_eq!(data[0]["value"], "12 Example St");
}

#[tokio::test]
async fn post_against_unknown_entity_is_404() {
    let app = app().await;
    let (status, _) = send(
        &app,
        post(
            "/entities/unknown/addresses",
            json!({ "value": "12 Example St" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn post_with_empty_value_is_400() {
    let app = app().await;
    let entity_id = create_entity(&app, "Coles").await;

    let (status, _) = send(
        &app,
        post(
            &format!("/entities/{entity_id}/addresses"),
            json!({ "value": "   " }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn get_against_unknown_entity_is_404() {
    let app = app().await;
    let (status, _) = send(&app, get("/entities/unknown/addresses")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn get_with_no_addresses_returns_an_empty_list() {
    let app = app().await;
    let entity_id = create_entity(&app, "Aldi").await;

    let (status, body) = send(&app, get(&format!("/entities/{entity_id}/addresses"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"].as_array().expect("data array").len(), 0);
}
