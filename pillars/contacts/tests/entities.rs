//! Per-route integration tests for the entities CRUD + bulk-lookup + search
//! surface, driving the fully assembled axum router through
//! `tower::ServiceExt::oneshot` against a migrated in-memory SQLite DB. These
//! exercise the whole request → handler → DB → serialization path, including
//! status codes and the JSON wire shape, not just the repo functions in
//! isolation.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use contacts::app::{build_router, AppState};
use contacts::db;

async fn app() -> axum::Router {
    app_with_pool().await.0
}

async fn app_with_pool() -> (axum::Router, sqlx::SqlitePool) {
    let pool = db::connect("sqlite::memory:")
        .await
        .expect("in-memory pool connects and migrates");
    let router = build_router(AppState {
        pool: pool.clone(),
        version: "1.2.3-test".to_string(),
    });
    (router, pool)
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

fn patch(path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("PATCH")
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get(path: &str) -> Request<Body> {
    Request::builder().uri(path).body(Body::empty()).unwrap()
}

fn delete(path: &str) -> Request<Body> {
    Request::builder()
        .method("DELETE")
        .uri(path)
        .body(Body::empty())
        .unwrap()
}

fn put_bytes(path: &str, content_type: &str, bytes: Vec<u8>) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(path)
        .header("content-type", content_type)
        .body(Body::from(bytes))
        .unwrap()
}

async fn send_raw(
    app: &axum::Router,
    req: Request<Body>,
) -> (StatusCode, axum::http::HeaderMap, axum::body::Bytes) {
    let response = app.clone().oneshot(req).await.expect("router responds");
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body collects")
        .to_bytes();
    (status, headers, body)
}

async fn create_contact(app: &axum::Router, body: Value) -> Value {
    let (status, body) = send(app, post("/entities", body)).await;
    assert_eq!(status, StatusCode::CREATED, "create returns 201: {body}");
    body["data"].clone()
}

#[tokio::test]
async fn create_returns_201_with_the_projected_entity() {
    let app = app().await;
    let data = create_contact(
        &app,
        json!({
            "name": "Acme",
            "type": "company",
            "abn": "123",
            "aliases": ["ACME Corp", "Acme Inc"],
            "defaultTags": ["vendor"],
            "notes": "primary supplier"
        }),
    )
    .await;

    assert!(data["id"].as_str().is_some());
    assert_eq!(data["name"], "Acme");
    assert_eq!(data["type"], "company");
    assert_eq!(data["abn"], "123");
    assert_eq!(data["aliases"], json!(["ACME Corp", "Acme Inc"]));
    assert_eq!(data["defaultTags"], json!(["vendor"]));
    assert!(data["lastEditedTime"].as_str().unwrap().ends_with('Z'));
    assert!(
        data.get("notionId").is_none(),
        "the integration columns are never exposed on the wire"
    );
    assert!(data.get("ownerUri").is_none());
}

#[tokio::test]
async fn create_defaults_type_to_company() {
    let app = app().await;
    let data = create_contact(&app, json!({ "name": "NoType" })).await;
    assert_eq!(data["type"], "company");
    assert_eq!(data["aliases"], json!([]));
    assert_eq!(data["defaultTags"], json!([]));
    assert_eq!(data["abn"], Value::Null);
}

#[tokio::test]
async fn duplicate_name_create_is_a_409() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Dup" })).await;
    let (status, body) = send(&app, post("/entities", json!({ "name": "Dup" }))).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], "ConflictError");
    assert!(body["message"].as_str().unwrap().contains("Dup"));
}

#[tokio::test]
async fn case_variant_name_create_is_a_409() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Acme" })).await;

    let (status, body) = send(&app, post("/entities", json!({ "name": "ACME" }))).await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a case-variant create collides with the existing contact: {body}"
    );
    assert_eq!(body["code"], "ConflictError");

    let (status, list) = send(&app, get("/entities")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        list["pagination"]["total"], 1,
        "no second row was created for the case variant"
    );
    assert_eq!(list["data"][0]["name"], "Acme");
}

#[tokio::test]
async fn empty_name_create_is_a_400() {
    let app = app().await;
    let (status, _) = send(&app, post("/entities", json!({ "name": "   " }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn invalid_type_create_is_a_400() {
    let app = app().await;
    let (status, body) = send(
        &app,
        post("/entities", json!({ "name": "X", "type": "wizard" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("wizard"));
}

#[tokio::test]
async fn get_returns_the_entity_then_404_after_delete() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "Gettable" })).await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["name"], "Gettable");

    let (status, body) = send(&app, delete(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["message"], "Entity deleted");

    let (status, _) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn get_unknown_id_is_a_404() {
    let app = app().await;
    let (status, body) = send(&app, get("/entities/nope")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NotFoundError");
}

#[tokio::test]
async fn delete_unknown_id_is_a_404() {
    let app = app().await;
    let (status, _) = send(&app, delete("/entities/nope")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_filters_paginates_and_orders_case_insensitively() {
    let app = app().await;
    for (name, ty) in [
        ("zebra", "company"),
        ("Apple", "person"),
        ("apricot", "company"),
    ] {
        create_contact(&app, json!({ "name": name, "type": ty })).await;
    }

    let (status, body) = send(&app, get("/entities")).await;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<&str> = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["Apple", "apricot", "zebra"]);
    assert_eq!(body["pagination"]["total"], 3);
    assert_eq!(body["pagination"]["hasMore"], false);

    let (_, body) = send(&app, get("/entities?search=ap")).await;
    assert_eq!(body["pagination"]["total"], 2);

    let (_, body) = send(&app, get("/entities?type=person")).await;
    assert_eq!(body["pagination"]["total"], 1);
    assert_eq!(body["data"][0]["name"], "Apple");

    let (_, body) = send(&app, get("/entities?limit=2&offset=0")).await;
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
    assert_eq!(body["pagination"]["hasMore"], true);
}

/// An alias is the entity's other name. A search that only saw `name` told the
/// callers that resolve a name to an id that a known merchant was unknown, and
/// they created a second entity for it.
#[tokio::test]
async fn list_search_matches_an_alias_as_well_as_the_name() {
    let app = app().await;
    create_contact(
        &app,
        json!({ "name": "McDonald's", "type": "company", "aliases": ["Maccas", "Golden Arches"] }),
    )
    .await;
    create_contact(&app, json!({ "name": "Coles", "type": "company" })).await;

    let (status, body) = send(&app, get("/entities?search=Maccas")).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["pagination"]["total"], 1);
    assert_eq!(body["data"][0]["name"], "McDonald's");

    let (_, body) = send(&app, get("/entities?search=Arches")).await;
    assert_eq!(body["pagination"]["total"], 1);

    let (_, body) = send(&app, get("/entities?search=Bunnings")).await;
    assert_eq!(body["pagination"]["total"], 0);
}

#[tokio::test]
async fn list_rejects_an_invalid_type_filter() {
    let app = app().await;
    let (status, _) = send(&app, get("/entities?type=wizard")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn patch_applies_partial_changes_and_can_clear_nullable_fields() {
    let app = app().await;
    let created = create_contact(
        &app,
        json!({ "name": "Patchable", "abn": "999", "notes": "old" }),
    )
    .await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(
        &app,
        patch(
            &format!("/entities/{id}"),
            json!({ "notes": "new", "abn": null, "aliases": ["x"] }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["notes"], "new");
    assert_eq!(body["data"]["abn"], Value::Null);
    assert_eq!(body["data"]["aliases"], json!(["x"]));
    assert_eq!(body["data"]["name"], "Patchable");
}

#[tokio::test]
async fn patch_rename_to_existing_name_is_a_409() {
    let app = app().await;
    create_contact(&app, json!({ "name": "First" })).await;
    let second = create_contact(&app, json!({ "name": "Second" })).await;
    let id = second["id"].as_str().unwrap();

    let (status, _) = send(
        &app,
        patch(&format!("/entities/{id}"), json!({ "name": "First" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn patch_unknown_id_is_a_404() {
    let app = app().await;
    let (status, _) = send(&app, patch("/entities/nope", json!({ "notes": "x" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn bulk_lookup_returns_the_whole_match_set() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Acme", "aliases": ["ACME Corp"] })).await;
    create_contact(&app, json!({ "name": "Beta" })).await;

    let (status, body) = send(&app, post("/entities/lookup", json!({}))).await;
    assert_eq!(status, StatusCode::OK);
    let entities = body["entities"].as_array().unwrap();
    assert_eq!(entities.len(), 2);
    assert!(body["fetchedAt"].as_str().unwrap().ends_with('Z'));

    let acme = entities.iter().find(|e| e["name"] == "Acme").unwrap();
    assert_eq!(acme["aliases"], json!(["ACME Corp"]));
    assert!(
        acme.get("notes").is_none(),
        "lookup returns only the match columns (id, name, aliases)"
    );
}

#[tokio::test]
async fn search_ranks_and_caps_hits() {
    let app = app().await;
    for name in ["Acme", "Acme Corp", "The Acme Group", "Unrelated"] {
        create_contact(&app, json!({ "name": name })).await;
    }

    let (status, body) = send(
        &app,
        post("/search", json!({ "query": { "text": "Acme" } })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let hits = body["hits"].as_array().unwrap();
    assert_eq!(hits.len(), 3, "Unrelated does not contain the term");

    assert_eq!(hits[0]["data"]["name"], "Acme");
    assert_eq!(hits[0]["score"], 1.0);
    assert_eq!(hits[0]["matchType"], "exact");
    assert!(hits[0]["uri"]
        .as_str()
        .unwrap()
        .starts_with("pops:contacts/contact/"));

    let scores: Vec<f64> = hits.iter().map(|h| h["score"].as_f64().unwrap()).collect();
    assert!(
        scores.windows(2).all(|w| w[0] >= w[1]),
        "hits are sorted by descending score: {scores:?}"
    );
}

#[tokio::test]
async fn search_with_empty_text_returns_no_hits() {
    let app = app().await;
    create_contact(&app, json!({ "name": "Acme" })).await;
    let (status, body) = send(&app, post("/search", json!({ "query": { "text": "  " } }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["hits"], json!([]));
}

/// POPS-3061 design correction: `colour` is assigned server-side at creation
/// from the fixed palette, never client-supplied.
#[tokio::test]
async fn create_assigns_a_colour_from_the_fixed_palette_and_ignores_a_client_value() {
    let app = app().await;
    let data = create_contact(&app, json!({ "name": "Branded", "colour": "#3B82F6" })).await;
    let colour = data["colour"]
        .as_str()
        .expect("create always assigns a colour");
    assert_ne!(
        colour, "#3B82F6",
        "a client-supplied colour on create must be ignored"
    );
    assert!(
        contacts::entities::colours::ENTITY_COLOURS.contains(&colour),
        "the assigned colour must be a fixed-palette entry, got {colour}"
    );
    assert_eq!(data["avatarAssetId"], Value::Null);
    assert_eq!(data["posterAssetId"], Value::Null);
}

/// A generic PATCH body cannot change `colour` at all, whether or not the
/// value it carries is a real palette entry.
#[tokio::test]
async fn generic_patch_does_not_change_colour() {
    let app = app().await;
    let data = create_contact(&app, json!({ "name": "Branded" })).await;
    let original_colour = data["colour"].as_str().unwrap().to_string();
    let id = data["id"].as_str().unwrap();

    let (status, body) = send(
        &app,
        patch(&format!("/entities/{id}"), json!({ "colour": "amber" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "an unknown key is not a 400: {body}"
    );
    assert_eq!(
        body["data"]["colour"], original_colour,
        "a generic PATCH must not be able to change colour"
    );

    let (status, body) = send(
        &app,
        patch(&format!("/entities/{id}"), json!({ "colour": null })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["colour"], original_colour,
        "a generic PATCH must not be able to clear colour either"
    );
}

/// `POST /entities/{id}/colour/reroll` is the only way to change `colour`
/// after creation, and it must produce a different palette entry every time —
/// a reroll that could return the same value would be a pointless no-op.
#[tokio::test]
async fn reroll_colour_always_changes_to_another_palette_entry() {
    let app = app().await;
    let data = create_contact(&app, json!({ "name": "Rerollable" })).await;
    let id = data["id"].as_str().unwrap();
    let mut current = data["colour"].as_str().unwrap().to_string();

    for _ in 0..20 {
        let (status, body) = send(
            &app,
            Request::builder()
                .method("POST")
                .uri(format!("/entities/{id}/colour/reroll"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let next = body["data"]["colour"].as_str().unwrap().to_string();
        assert_ne!(
            next, current,
            "a reroll must never return the current colour"
        );
        assert!(
            contacts::entities::colours::ENTITY_COLOURS.contains(&next.as_str()),
            "a reroll must only ever produce a palette value, got {next}"
        );
        current = next;
    }
}

#[tokio::test]
async fn reroll_colour_on_missing_entity_is_not_found() {
    let app = app().await;
    let (status, _) = send(
        &app,
        Request::builder()
            .method("POST")
            .uri("/entities/nope/colour/reroll")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// POPS-3061 review finding: create/PATCH must not be able to set or clear
/// `avatarAssetId`/`posterAssetId` at all — those keys in a request body are
/// simply ignored, since the fields don't exist on `CreateEntityBody` /
/// `UpdateEntityBody` any more. The only legitimate write paths are the
/// dedicated upload (`PUT`) and remove (`DELETE`) routes, covered by their
/// own tests below.
#[tokio::test]
async fn create_and_patch_ignore_avatar_and_poster_asset_id() {
    let app = app().await;
    let created = create_contact(
        &app,
        json!({ "name": "Sneaky", "avatarAssetId": "attacker-controlled", "posterAssetId": "also-attacker-controlled" }),
    )
    .await;
    assert_eq!(
        created["avatarAssetId"],
        Value::Null,
        "create must not honor a client-supplied avatarAssetId"
    );
    assert_eq!(
        created["posterAssetId"],
        Value::Null,
        "create must not honor a client-supplied posterAssetId"
    );
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(
        &app,
        patch(
            &format!("/entities/{id}"),
            json!({ "avatarAssetId": "still-attacker-controlled", "posterAssetId": "still-attacker-controlled" }),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "unknown keys are not a 400, just ignored: {body}"
    );
    assert_eq!(
        body["data"]["avatarAssetId"],
        Value::Null,
        "a generic PATCH must not be able to set avatarAssetId"
    );
    assert_eq!(
        body["data"]["posterAssetId"],
        Value::Null,
        "a generic PATCH must not be able to set posterAssetId"
    );
}

#[tokio::test]
async fn avatar_upload_then_serve_round_trips_the_bytes() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "Avatarable" })).await;
    let id = created["id"].as_str().unwrap();

    let png_bytes = vec![0x89, b'P', b'N', b'G', 1, 2, 3, 4];
    let (status, body) = send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/png",
            png_bytes.clone(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let asset_id = body["data"]["avatarAssetId"]
        .as_str()
        .expect("avatarAssetId is set")
        .to_string();

    let (status, headers, served) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("content-type").unwrap(), "image/png");
    assert_eq!(served.as_ref(), png_bytes.as_slice());

    let (status, body) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(body["data"]["avatarAssetId"], asset_id);
    let _ = status;
}

#[tokio::test]
async fn poster_upload_then_serve_round_trips_the_bytes() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "Posterable" })).await;
    let id = created["id"].as_str().unwrap();

    let jpeg_bytes = vec![0xFF, 0xD8, 0xFF, 9, 9, 9];
    let (status, _) = send(
        &app,
        put_bytes(
            &format!("/entities/{id}/poster"),
            "image/jpeg",
            jpeg_bytes.clone(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, headers, served) = send_raw(&app, get(&format!("/entities/{id}/poster"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("content-type").unwrap(), "image/jpeg");
    assert_eq!(served.as_ref(), jpeg_bytes.as_slice());
}

#[tokio::test]
async fn serving_an_unset_avatar_is_a_404() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "NoAvatar" })).await;
    let id = created["id"].as_str().unwrap();
    let (status, _, _) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn avatar_upload_rejects_a_disallowed_content_type() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "SvgAttempt" })).await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/svg+xml",
            b"<svg onload=alert(1)></svg>".to_vec(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["message"].as_str().unwrap().contains("image/svg+xml"));

    let (status, _, _) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "the rejected upload must not have been stored"
    );
}

#[tokio::test]
async fn avatar_upload_rejects_an_oversized_payload() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "TooBig" })).await;
    let id = created["id"].as_str().unwrap();

    let oversized = vec![0u8; 2 * 1024 * 1024 + 1];
    let (status, body) = send(
        &app,
        put_bytes(&format!("/entities/{id}/avatar"), "image/png", oversized),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["message"]
        .as_str()
        .unwrap()
        .to_lowercase()
        .contains("exceeds"));
}

#[tokio::test]
async fn replacing_an_avatar_deletes_the_old_blob() {
    let (app, pool) = app_with_pool().await;
    let created = create_contact(&app, json!({ "name": "Replaceable" })).await;
    let id = created["id"].as_str().unwrap();

    send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/png",
            vec![1, 2, 3],
        ),
    )
    .await;
    let (_, body) = send(&app, get(&format!("/entities/{id}"))).await;
    let first_asset_id = body["data"]["avatarAssetId"].as_str().unwrap().to_string();

    let (status, body) = send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/png",
            vec![4, 5, 6],
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let second_asset_id = body["data"]["avatarAssetId"].as_str().unwrap();
    assert_ne!(
        first_asset_id, second_asset_id,
        "a replace mints a new blob"
    );

    let (status, headers, served) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("content-type").unwrap(), "image/png");
    assert_eq!(served.as_ref(), &[4, 5, 6]);

    assert!(
        contacts::blobs::repo::get(&pool, &first_asset_id)
            .await
            .expect("query")
            .is_none(),
        "the superseded blob row must be deleted, not orphaned"
    );
}

#[tokio::test]
async fn removing_an_avatar_clears_it_and_deletes_the_old_blob() {
    let (app, pool) = app_with_pool().await;
    let created = create_contact(&app, json!({ "name": "Clearable" })).await;
    let id = created["id"].as_str().unwrap();

    send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/png",
            vec![1, 2, 3],
        ),
    )
    .await;
    let (_, body) = send(&app, get(&format!("/entities/{id}"))).await;
    let asset_id = body["data"]["avatarAssetId"].as_str().unwrap().to_string();

    let (status, body) = send(&app, delete(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["avatarAssetId"],
        Value::Null,
        "DELETE clears avatarAssetId"
    );

    let (status, _, _) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "the entity no longer resolves an avatar"
    );

    assert!(
        contacts::blobs::repo::get(&pool, &asset_id)
            .await
            .expect("query")
            .is_none(),
        "clearing the reference must delete the underlying blob, not orphan it"
    );

    let (_, body) = send(&app, get(&format!("/entities/{id}"))).await;
    assert_eq!(
        body["data"]["avatarAssetId"],
        Value::Null,
        "still null after a plain re-fetch"
    );
}

#[tokio::test]
async fn removing_an_unset_avatar_is_a_no_op() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "AlreadyBare" })).await;
    let id = created["id"].as_str().unwrap();

    let (status, body) = send(&app, delete(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["avatarAssetId"], Value::Null);
}

#[tokio::test]
async fn patch_ignoring_avatar_asset_id_leaves_it_untouched() {
    let app = app().await;
    let created = create_contact(&app, json!({ "name": "Untouched" })).await;
    let id = created["id"].as_str().unwrap();

    send(
        &app,
        put_bytes(
            &format!("/entities/{id}/avatar"),
            "image/png",
            vec![7, 8, 9],
        ),
    )
    .await;
    let (_, before) = send(&app, get(&format!("/entities/{id}"))).await;
    let asset_id = before["data"]["avatarAssetId"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, body) = send(
        &app,
        patch(
            &format!("/entities/{id}"),
            json!({ "notes": "unrelated change", "avatarAssetId": "attacker-controlled" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["avatarAssetId"], asset_id,
        "a generic PATCH can never touch avatarAssetId, whether it names the key or not"
    );

    let (status, _, _) = send_raw(&app, get(&format!("/entities/{id}/avatar"))).await;
    assert_eq!(status, StatusCode::OK, "the blob is still there");
}
