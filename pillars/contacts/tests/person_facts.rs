//! Person drafts preserve exact evidence, reject stale writes and undo only still-owned decisions.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use contacts::{
    app::{build_router, AppState},
    db,
    persons::{
        model::{ContactPointInput, ContactPointKind, PersonName},
        repo as persons,
    },
    sources::{
        model::{SourceAccountInput, SourceRecordInput},
        repo as sources,
    },
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;

async fn app() -> (axum::Router, SqlitePool, String) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    let id = persons::create_person(&mut tx, "Original person")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let router = build_router(AppState {
        pool: pool.clone(),
        version: "test".into(),
        service_account_scope_verifier: common::service_account_scope_verifier(),
    });
    (router, pool, id)
}

async fn send(app: &axum::Router, method: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}

async fn facts(app: &axum::Router, id: &str) -> Value {
    let (status, body) = send(app, "GET", &format!("/entities/{id}/facts"), Value::Null).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["data"].clone()
}

async fn apply(app: &axum::Router, id: &str, key: &str, changes: Value) -> Value {
    let version = facts(app, id).await["version"].clone();
    let (status, body) = send(
        app,
        "POST",
        &format!("/entities/{id}/facts/changes"),
        json!({"expectedVersion":version,"idempotencyKey":key,"changes":changes}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

async fn undo(app: &axum::Router, id: &str, operation: &str, key: &str) -> (StatusCode, Value) {
    let version = facts(app, id).await["version"].clone();
    send(
        app,
        "POST",
        &format!("/entities/{id}/facts/changes/{operation}/undo"),
        json!({"expectedVersion":version,"idempotencyKey":key}),
    )
    .await
}

fn point(value: &str) -> ContactPointInput {
    ContactPointInput {
        kind: ContactPointKind::Email,
        value: value.into(),
        label: Some("Original label".into()),
        country_code: None,
    }
}

async fn imported(pool: &SqlitePool, id: &str) -> SourceRecordInput {
    let account = sources::create_or_get_account(
        pool,
        &SourceAccountInput {
            provider: "test".into(),
            account_key: "person-facts".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let input = SourceRecordInput {
        account_id: account.id,
        collection_key: "book".into(),
        record_key: "original".into(),
        entity_id: id.into(),
        display_name: Some("Imported name".into()),
        name: PersonName::default(),
        points: vec![point(" Original@Example.test ")],
    };
    refresh(pool, &input).await;
    input
}

async fn refresh(pool: &SqlitePool, input: &SourceRecordInput) {
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(&mut tx, input).await.unwrap();
    tx.commit().await.unwrap();
}

#[tokio::test]
async fn imported_edit_is_a_selected_local_override_and_undo_preserves_provider_changes() {
    let (app, pool, id) = app().await;
    let mut input = imported(&pool, &id).await;
    let before = facts(&app, &id).await;
    let original = before["points"][0]["id"].as_str().unwrap();
    let saved=apply(&app,&id,"edit-imported",json!([{"action":"editPoint","pointId":original,"point":{"kind":"other","value":" opaque @ text \nsecond line ","label":"  custom label  "}}])).await;
    assert_eq!(saved["data"]["points"].as_array().unwrap().len(), 1);
    let replacement = &saved["data"]["points"][0];
    assert_eq!(replacement["value"], " opaque @ text \nsecond line ");
    assert_eq!(replacement["label"], "  custom label  ");
    assert_eq!(replacement["normalizedValue"], Value::Null);
    assert_eq!(replacement["sourceRecordId"], Value::Null);
    assert_eq!(replacement["preferred"], true);
    let retained: (String, Option<String>) =
        sqlx::query_as("SELECT value,source_record_id FROM contact_points WHERE id=?1")
            .bind(original)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained.0, " Original@Example.test ");
    assert!(retained.1.is_some());
    input.points = vec![point("new@example.test")];
    refresh(&pool, &input).await;
    let refreshed = facts(&app, &id).await;
    assert_eq!(refreshed["points"].as_array().unwrap().len(), 2);
    assert!(refreshed["points"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["value"] == "new@example.test"));
    let (status, undone) = undo(
        &app,
        &id,
        saved["operation"]["id"].as_str().unwrap(),
        "undo-imported",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{undone}");
    assert_eq!(undone["data"]["points"].as_array().unwrap().len(), 1);
    assert_eq!(undone["data"]["points"][0]["value"], "new@example.test");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM source_record_history")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 2);
    assert!(
        sqlx::query("UPDATE person_fact_operation_evidence SET evidence='{}'")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(sqlx::query("DELETE FROM person_fact_operations")
        .execute(&pool)
        .await
        .is_err());
}

#[tokio::test]
async fn remove_tombstones_exact_imported_point_and_new_provider_identity_remains_independent() {
    let (app, pool, id) = app().await;
    let mut input = imported(&pool, &id).await;
    let before = facts(&app, &id).await;
    let original = before["points"][0]["id"].as_str().unwrap();
    let saved = apply(
        &app,
        &id,
        "remove-imported",
        json!([{"action":"removePoint","pointId":original}]),
    )
    .await;
    assert!(saved["data"]["points"].as_array().unwrap().is_empty());
    input.points[0].label = Some("New provider observation".into());
    refresh(&pool, &input).await;
    let current = facts(&app, &id).await;
    assert_eq!(current["points"].as_array().unwrap().len(), 1);
    assert_ne!(current["points"][0]["id"], original);
    let (status, undone) = undo(
        &app,
        &id,
        saved["operation"]["id"].as_str().unwrap(),
        "restore-imported",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{undone}");
    assert_eq!(undone["data"]["points"], current["points"]);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contact_points WHERE source_record_id IS NOT NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 2);
}

#[tokio::test]
async fn stale_requests_retry_keys_and_atomic_validation_never_partially_apply() {
    let (app, pool, id) = app().await;
    let initial = facts(&app, &id).await;
    let body = json!({"expectedVersion":initial["version"],"idempotencyKey":"draft","changes":[{"action":"setEntity","name":"Chosen name","notes":"Chosen notes"},{"action":"addPoint","point":{"kind":"url","value":" https://example.test/raw "}}]});
    let path = format!("/entities/{id}/facts/changes");
    let (status, saved) = send(&app, "POST", &path, body.clone()).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["data"]["points"][0]["preferred"], false);
    let stale = json!({"expectedVersion":initial["version"],"idempotencyKey":"stale","changes":[{"action":"setEntity","name":"Stale name","notes":null}]});
    assert_eq!(
        send(&app, "POST", &path, stale).await.0,
        StatusCode::CONFLICT
    );
    let replay = send(&app, "POST", &path, body.clone()).await;
    assert_eq!(replay.0, StatusCode::OK);
    assert_eq!(replay.1, saved);
    let mut changed = body;
    changed["changes"][0]["name"] = json!("Different");
    assert_eq!(
        send(&app, "POST", &path, changed).await.0,
        StatusCode::CONFLICT
    );
    let version = facts(&app, &id).await["version"].clone();
    let invalid = json!({"expectedVersion":version,"idempotencyKey":"invalid","changes":[{"action":"setEntity","name":"Must roll back","notes":null},{"action":"addPoint","point":{"kind":"other","value":" "}}]});
    assert_eq!(
        send(&app, "POST", &path, invalid).await.0,
        StatusCode::BAD_REQUEST
    );
    let current = facts(&app, &id).await;
    assert_eq!(current["entity"]["name"], "Chosen name");
    assert_eq!(current["operations"].as_array().unwrap().len(), 1);
    let stored: String = sqlx::query_scalar("SELECT name FROM entities WHERE id=?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, "Original person");
    assert_eq!(
        send(&app, "GET", &format!("/entities/{id}"), Value::Null)
            .await
            .1["data"]["name"],
        "Chosen name"
    );
    let (status, undone) = undo(
        &app,
        &id,
        saved["operation"]["id"].as_str().unwrap(),
        "undo-draft",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{undone}");
    assert_eq!(undone["data"]["entity"]["name"], "Original person");
    assert!(undone["data"]["points"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn own_undo_stack_restores_prior_selection_ownership_but_foreign_reselection_conflicts() {
    let (app, _, id) = app().await;
    let first = apply(
        &app,
        &id,
        "add",
        json!([{"action":"addPoint","point":{"kind":"email","value":"first@example.test"}}]),
    )
    .await;
    let point = first["data"]["points"][0]["id"].as_str().unwrap();
    let second=apply(&app,&id,"edit",json!([{"action":"editPoint","pointId":point,"point":{"kind":"email","value":"second@example.test"}}])).await;
    let (status, restored) = undo(
        &app,
        &id,
        second["operation"]["id"].as_str().unwrap(),
        "undo-edit",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{restored}");
    assert_eq!(restored["data"]["points"][0]["value"], "first@example.test");
    assert_eq!(
        undo(
            &app,
            &id,
            first["operation"]["id"].as_str().unwrap(),
            "undo-add"
        )
        .await
        .0,
        StatusCode::OK
    );
    let added = apply(
        &app,
        &id,
        "new-add",
        json!([{"action":"addPoint","point":{"kind":"email","value":"third@example.test"}}]),
    )
    .await;
    let point = added["data"]["points"][0]["id"].as_str().unwrap();
    let edited=apply(&app,&id,"new-edit",json!([{"action":"editPoint","pointId":point,"point":{"kind":"email","value":"fourth@example.test"}}])).await;
    let point = edited["data"]["points"][0]["id"].as_str().unwrap();
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{id}/contact-points/{point}/preferred"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let (status, conflicted) = undo(
        &app,
        &id,
        edited["operation"]["id"].as_str().unwrap(),
        "foreign-undo",
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{conflicted}");
    assert_eq!(
        facts(&app, &id).await["points"][0]["value"],
        "fourth@example.test"
    );
}

#[tokio::test]
async fn addresses_and_details_keep_raw_originals_and_foreign_writes_block_only_their_undo() {
    let (app, pool, id) = app().await;
    let added=apply(&app,&id,"add-address",json!([{"action":"addAddress","address":{"value":" 12 Example Street\nSecond line ","label":"Somewhere","city":" Literal city "}}])).await;
    let address = added["data"]["addresses"][0]["id"].as_str().unwrap();
    let edited=apply(&app,&id,"edit-address",json!([{"action":"editAddress","addressId":address,"address":{"value":"Replacement","label":"Arbitrary label","city":"Another literal"}}])).await;
    let stored: String = sqlx::query_scalar("SELECT value FROM entity_addresses WHERE id=?1")
        .bind(address)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, " 12 Example Street\nSecond line ");
    assert_eq!(
        send(
            &app,
            "GET",
            &format!("/entities/{id}/addresses"),
            Value::Null
        )
        .await
        .1["data"][0]["value"],
        "Replacement"
    );
    let removed = apply(
        &app,
        &id,
        "remove-address",
        json!([{"action":"removeAddress","addressId":address}]),
    )
    .await;
    assert!(removed["data"]["addresses"].as_array().unwrap().is_empty());
    assert_eq!(
        undo(
            &app,
            &id,
            removed["operation"]["id"].as_str().unwrap(),
            "restore-address"
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        undo(
            &app,
            &id,
            edited["operation"]["id"].as_str().unwrap(),
            "restore-original-address"
        )
        .await
        .0,
        StatusCode::OK
    );
    let details = apply(
        &app,
        &id,
        "details",
        json!([{"action":"setEntity","name":"Local override","notes":"local"}]),
    )
    .await;
    assert_eq!(
        send(
            &app,
            "PATCH",
            &format!("/entities/{id}"),
            json!({"name":"Foreign name"})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        undo(
            &app,
            &id,
            details["operation"]["id"].as_str().unwrap(),
            "details-conflict"
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let current = facts(&app, &id).await;
    assert_eq!(current["entity"]["name"], "Foreign name");
    assert_eq!(current["entity"]["notes"], "local");
    assert_eq!(
        undo(
            &app,
            &id,
            added["operation"]["id"].as_str().unwrap(),
            "undo-initial-address"
        )
        .await
        .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn a_late_storage_failure_rolls_back_every_decision_and_audit_row() {
    let (app, pool, id) = app().await;
    let original = facts(&app, &id).await;
    sqlx::raw_sql("CREATE TRIGGER reject_fact_test BEFORE INSERT ON contact_points WHEN NEW.value='reject' BEGIN SELECT RAISE(ABORT,'test failure'); END;")
        .execute(&pool).await.unwrap();
    let (status,body)=send(&app,"POST",&format!("/entities/{id}/facts/changes"),json!({"expectedVersion":original["version"],"idempotencyKey":"late-failure","changes":[{"action":"setEntity","name":"Must roll back","notes":"also rolls back"},{"action":"addPoint","point":{"kind":"other","value":"reject"}}]})).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert_eq!(body["code"], "contacts.internal");
    assert!(!body["message"].as_str().unwrap().contains("test failure"));
    assert_eq!(facts(&app, &id).await, original);
}

#[tokio::test]
async fn concurrent_drafts_have_one_winner_and_stale_undo_does_not_mutate_it() {
    let (app, _, id) = app().await;
    let original = facts(&app, &id).await;
    let path = format!("/entities/{id}/facts/changes");
    let first = json!({"expectedVersion":original["version"],"idempotencyKey":"race-first","changes":[{"action":"setEntity","name":"First writer","notes":null}]});
    let second = json!({"expectedVersion":original["version"],"idempotencyKey":"race-second","changes":[{"action":"setEntity","name":"Second writer","notes":null}]});
    let (first, second) = tokio::join!(
        send(&app, "POST", &path, first),
        send(&app, "POST", &path, second)
    );
    let winner = if first.0 == StatusCode::OK {
        assert_eq!(second.0, StatusCode::CONFLICT);
        first.1
    } else {
        assert_eq!(first.0, StatusCode::CONFLICT);
        assert_eq!(second.0, StatusCode::OK);
        second.1
    };
    let undo_path = format!(
        "/entities/{id}/facts/changes/{}/undo",
        winner["operation"]["id"].as_str().unwrap()
    );
    let (status, body) = send(
        &app,
        "POST",
        &undo_path,
        json!({"expectedVersion":original["version"],"idempotencyKey":"stale-undo"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(facts(&app, &id).await, winner["data"]);
}

#[tokio::test]
async fn a_foreign_address_base_write_stays_visible_and_cannot_be_undone_by_its_creator() {
    let (app, pool, id) = app().await;
    let added = apply(
        &app,
        &id,
        "new-address",
        json!([{"action":"addAddress","address":{"value":"Original"}}]),
    )
    .await;
    let address = added["data"]["addresses"][0]["id"].as_str().unwrap();
    sqlx::query(
        "UPDATE entity_addresses SET value='Foreign writer',city='Foreign city' WHERE id=?1",
    )
    .bind(address)
    .execute(&pool)
    .await
    .unwrap();
    let current = facts(&app, &id).await;
    assert_eq!(current["addresses"][0]["value"], "Foreign writer");
    assert_eq!(current["addresses"][0]["city"], "Foreign city");
    assert_eq!(
        undo(
            &app,
            &id,
            added["operation"]["id"].as_str().unwrap(),
            "foreign-address-undo"
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(facts(&app, &id).await, current);
}

#[tokio::test]
async fn explicit_contact_deletion_cascades_current_facts_and_retains_immutable_operation_history()
{
    let (app, pool, id) = app().await;
    let added=apply(&app,&id,"deletable-contact",json!([{"action":"setEntity","name":"Edited person","notes":"Edited notes"},{"action":"addPoint","point":{"kind":"other","value":"Opaque value"}},{"action":"addAddress","address":{"value":"Literal address"}}])).await;
    let point = added["data"]["points"][0]["id"].as_str().unwrap();
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{id}/contact-points/{point}/preferred"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let (status, body) = send(&app, "DELETE", &format!("/entities/{id}"), Value::Null).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    for query in [
        "SELECT COUNT(*) FROM person_fact_decisions",
        "SELECT COUNT(*) FROM person_fact_origins",
        "SELECT COUNT(*) FROM person_fact_selection_versions",
        "SELECT COUNT(*) FROM contact_points",
        "SELECT COUNT(*) FROM entity_addresses",
    ] {
        let count: i64 = sqlx::query_scalar(query).fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0);
    }
    let retained:i64=sqlx::query_scalar("SELECT COUNT(*) FROM person_fact_operations o JOIN person_fact_operation_evidence e ON e.operation_id=o.id WHERE o.entity_id=?1").bind(id).fetch_one(&pool).await.unwrap();
    assert_eq!(retained, 1);
    assert!(sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await
        .unwrap()
        .is_empty());
    assert!(sqlx::query("DELETE FROM person_fact_operations")
        .execute(&pool)
        .await
        .is_err());
}

#[tokio::test]
async fn selections_accept_every_supported_kind_including_opaque_other() {
    let (_, pool, id) = app().await;
    let mut tx = pool.begin().await.unwrap();
    let mut ids = Vec::new();
    for kind in ContactPointKind::ALL {
        let value = match kind {
            ContactPointKind::Email => "person@example.test",
            ContactPointKind::Phone => "+61400000000",
            _ => "Opaque value",
        };
        ids.push(
            persons::insert_point(
                &mut tx,
                &id,
                &ContactPointInput {
                    kind,
                    value: value.into(),
                    label: None,
                    country_code: None,
                },
                None,
            )
            .await
            .unwrap()
            .id,
        );
    }
    let selected = contacts::merges::service::select_in_transaction(&mut tx, &id, &[], &ids)
        .await
        .unwrap();
    assert_eq!(selected.len(), ContactPointKind::ALL.len());
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &id).await.unwrap();
    assert_eq!(
        points.iter().filter(|point| point.preferred).count(),
        ContactPointKind::ALL.len()
    );
    let other = points.iter().find(|point| point.kind == "other").unwrap();
    assert_eq!(other.normalized_value, None);
}

#[tokio::test]
async fn merge_field_selection_uses_the_selected_members_effective_local_facts() {
    let (app, pool, member) = app().await;
    let (status, created) = send(
        &app,
        "POST",
        "/entities",
        json!({"name":"Canonical person","type":"person"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let canonical = created["data"]["id"].as_str().unwrap();
    let saved = apply(
        &app,
        &member,
        "selected-local-member",
        json!([{"action":"setEntity","name":"Chosen member name","notes":"Chosen member notes"}]),
    )
    .await;
    let (status, merged) = send(&app, "POST", "/merges", json!({
        "canonicalId":canonical,"memberIds":[member],"expectedRevision":saved["data"]["version"],"idempotencyKey":"merge-effective-member","evidence":"explicit local field selection",
        "selections":[{"kind":"entity","field":"name","entityId":member},{"kind":"entity","field":"notes","entityId":member}]
    })).await;
    assert_eq!(status, StatusCode::OK, "{merged}");
    let projected = facts(&app, canonical).await;
    assert_eq!(projected["entity"]["name"], "Chosen member name");
    assert_eq!(projected["entity"]["notes"], "Chosen member notes");
    let (status, directory) = send(
        &app,
        "GET",
        "/entities?search=Chosen%20member%20name",
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(directory["data"].as_array().unwrap().len(), 1);
    assert_eq!(directory["data"][0]["id"], canonical);
    assert_eq!(directory["data"][0]["name"], "Chosen member name");
    let (status, lookup) = send(&app, "POST", "/entities/lookup", json!({"ids":[canonical]})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(lookup["entities"][0]["name"], "Chosen member name");
    let stored: (String, Option<String>) =
        sqlx::query_as("SELECT name,notes FROM entities WHERE id=?1")
            .bind(&member)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored, ("Original person".into(), None));
}

#[derive(Clone, Copy)]
enum HiddenPoint {
    Replaced,
    Removed,
    UndoneAddition,
}

async fn rejects_hidden_preference(hidden: HiddenPoint, merging: bool) {
    let (app, pool, id) = app().await;
    let mut tx = pool.begin().await.unwrap();
    let member = persons::create_person(&mut tx, "Other person")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let added = apply(
        &app,
        &id,
        "add-hidden",
        json!([{"action":"addPoint","point":{"kind":"email","value":"hidden@example.test"}}]),
    )
    .await;
    let hidden_id = added["data"]["points"][0]["id"].as_str().unwrap();
    match hidden {
        HiddenPoint::Replaced => {
            apply(&app, &id, "replace-hidden", json!([{"action":"editPoint","pointId":hidden_id,"point":{"kind":"email","value":"replacement@example.test"}}])).await;
        }
        HiddenPoint::Removed => {
            apply(
                &app,
                &id,
                "remove-hidden",
                json!([{"action":"removePoint","pointId":hidden_id}]),
            )
            .await;
        }
        HiddenPoint::UndoneAddition => {
            assert_eq!(
                undo(
                    &app,
                    &id,
                    added["operation"]["id"].as_str().unwrap(),
                    "undo-hidden"
                )
                .await
                .0,
                StatusCode::OK
            );
        }
    }
    let visible = apply(
        &app,
        &id,
        "add-visible",
        json!([{"action":"addPoint","point":{"kind":"email","value":"visible@example.test"}}]),
    )
    .await;
    let visible_id = visible["data"]["points"]
        .as_array()
        .unwrap()
        .iter()
        .find(|point| point["value"] == "visible@example.test")
        .unwrap()["id"]
        .as_str()
        .unwrap();
    let editable = apply(&app, &id, "edit-visible", json!([{"action":"editPoint","pointId":visible_id,"point":{"kind":"email","value":"preferred@example.test"}}])).await;
    let before = facts(&app, &id).await;
    assert!(before["points"]
        .as_array()
        .unwrap()
        .iter()
        .any(|point| point["value"] == "preferred@example.test" && point["preferred"] == true));
    let (status, body) = if merging {
        send(&app, "POST", "/merges", json!({"canonicalId":id,"memberIds":[member],"expectedRevision":before["version"],"idempotencyKey":"hidden-merge","evidence":"Explicit test selection","preferredPointIds":[hidden_id]})).await
    } else {
        send(
            &app,
            "PUT",
            &format!("/entities/{id}/contact-points/{hidden_id}/preferred"),
            Value::Null,
        )
        .await
    };
    assert_eq!(
        status,
        if merging {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::NOT_FOUND
        },
        "{body}"
    );
    assert_eq!(facts(&app, &id).await, before);
    let (status, group) = send(
        &app,
        "GET",
        &format!("/merges/groups/{member}"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(group["canonicalId"], member);
    assert_eq!(
        undo(
            &app,
            &id,
            editable["operation"]["id"].as_str().unwrap(),
            "undo-visible"
        )
        .await
        .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn preferred_put_rejects_replaced_point_without_mutation() {
    rejects_hidden_preference(HiddenPoint::Replaced, false).await;
}

#[tokio::test]
async fn preferred_put_rejects_removed_point_without_mutation() {
    rejects_hidden_preference(HiddenPoint::Removed, false).await;
}

#[tokio::test]
async fn preferred_put_rejects_undone_addition_without_mutation() {
    rejects_hidden_preference(HiddenPoint::UndoneAddition, false).await;
}

#[tokio::test]
async fn merge_rejects_replaced_point_without_mutation() {
    rejects_hidden_preference(HiddenPoint::Replaced, true).await;
}

#[tokio::test]
async fn merge_rejects_removed_point_without_mutation() {
    rejects_hidden_preference(HiddenPoint::Removed, true).await;
}

#[tokio::test]
async fn merge_rejects_undone_addition_without_mutation() {
    rejects_hidden_preference(HiddenPoint::UndoneAddition, true).await;
}

#[tokio::test]
async fn preference_paths_accept_inactive_provider_observations() {
    for merging in [false, true] {
        let (app, pool, id) = app().await;
        let mut input = imported(&pool, &id).await;
        let original = facts(&app, &id).await["points"][0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        input.points.clear();
        refresh(&pool, &input).await;
        assert!(facts(&app, &id).await["points"]
            .as_array()
            .unwrap()
            .is_empty());
        let (status, body) = if merging {
            let mut tx = pool.begin().await.unwrap();
            let member = persons::create_person(&mut tx, "Other person")
                .await
                .unwrap();
            tx.commit().await.unwrap();
            let current = facts(&app, &id).await;
            send(&app, "POST", "/merges", json!({"canonicalId":id,"memberIds":[member],"expectedRevision":current["version"],"idempotencyKey":"inactive-merge","evidence":"Retained provider evidence","preferredPointIds":[original]})).await
        } else {
            send(
                &app,
                "PUT",
                &format!("/entities/{id}/contact-points/{original}/preferred"),
                Value::Null,
            )
            .await
        };
        assert_eq!(
            status,
            if merging {
                StatusCode::OK
            } else {
                StatusCode::NO_CONTENT
            },
            "{body}"
        );
        let current = facts(&app, &id).await;
        assert_eq!(current["points"][0]["id"], original);
        assert_eq!(current["points"][0]["active"], false);
        assert_eq!(current["points"][0]["preferred"], true);
    }
}
