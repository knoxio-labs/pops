mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use contacts::{
    app::{build_router, AppState},
    entities::{addresses_model::CreateAddressBody, addresses_repo, repo as entities},
    merges::{
        decisions,
        model::{FieldSelection, MergeBody, MergeField, SeparateBody, UndoBody},
        repo, service,
    },
    persons::{
        model::{ContactPointInput, ContactPointKind},
        repo as persons,
    },
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;

async fn pool() -> SqlitePool {
    contacts::db::connect("sqlite::memory:")
        .await
        .expect("migrated database")
}

async fn person(pool: &SqlitePool, name: &str) -> String {
    let mut conn = pool.acquire().await.expect("connection");
    persons::create_person(&mut conn, name)
        .await
        .expect("person")
}

async fn revision(pool: &SqlitePool) -> i64 {
    repo::revision(&mut pool.acquire().await.expect("connection"))
        .await
        .expect("revision")
}

async fn request(pool: &SqlitePool, canonical: &str, others: &[&str], key: &str) -> MergeBody {
    MergeBody {
        canonical_id: canonical.into(),
        member_ids: others.iter().map(|id| (*id).into()).collect(),
        expected_revision: revision(pool).await,
        idempotency_key: key.into(),
        evidence: "Operator compared the retained source records".into(),
        selections: vec![],
        preferred_point_ids: vec![],
    }
}

async fn api(pool: &SqlitePool, method: Method, path: &str, body: Value) -> (StatusCode, Value) {
    let router = build_router(AppState {
        pool: pool.clone(),
        version: "test".into(),
        service_account_scope_verifier: common::service_account_scope_verifier(),
    });
    let response = router
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("request"),
        )
        .await
        .expect("response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    (status, serde_json::from_slice(&bytes).expect("JSON"))
}

#[tokio::test]
async fn selected_subset_projects_fields_and_preserves_original_ids_and_ownership() {
    let pool = pool().await;
    let a = person(&pool, "Ada").await;
    let b = person(&pool, "Ada Lovelace").await;
    let c = person(&pool, "Different person").await;
    let d = person(&pool, "Review later").await;
    let address = addresses_repo::create(
        &pool,
        &b,
        CreateAddressBody {
            value: "Original branch".into(),
        },
    )
    .await
    .expect("address");
    let point = {
        let mut conn = pool.acquire().await.expect("connection");
        persons::insert_point(
            &mut conn,
            &b,
            &ContactPointInput {
                kind: ContactPointKind::Email,
                value: "ada@example.test".into(),
                label: Some("home".into()),
                country_code: None,
            },
            None,
        )
        .await
        .expect("point")
    };
    let mut body = request(&pool, &a, &[&b], "subset").await;
    body.selections.push(FieldSelection {
        field: MergeField::Name,
        entity_id: b.clone(),
    });
    body.preferred_point_ids.push(point.id.clone());
    let merged = service::merge(&pool, body).await.expect("merge");
    assert_eq!(merged.member_ids.len(), 2);
    let (rows, total) = entities::list(&pool, None, None, 100, 0)
        .await
        .expect("list");
    assert_eq!(total, 3);
    assert!(!rows.iter().any(|row| row.id == b));
    assert_eq!(
        entities::get(&pool, &b)
            .await
            .expect("get")
            .expect("entity")
            .name,
        "Ada Lovelace"
    );
    let original_name: String = sqlx::query_scalar("SELECT name FROM entities WHERE id=?1")
        .bind(&a)
        .fetch_one(&pool)
        .await
        .expect("original");
    assert_eq!(original_name, "Ada");
    let addresses = addresses_repo::list_for_entity(&pool, &a)
        .await
        .expect("addresses");
    assert_eq!(addresses[0].id, address.id);
    assert_eq!(addresses[0].entity_id, b);
    let points = persons::list_points(&pool, &a).await.expect("points");
    assert_eq!(points[0].entity_id, b);
    assert!(points[0].preferred);
    let original_preferred: bool =
        sqlx::query_scalar("SELECT preferred FROM contact_points WHERE id=?1")
            .bind(&point.id)
            .fetch_one(&pool)
            .await
            .expect("original flag");
    assert!(!original_preferred);
    let resolved = repo::resolve_many(
        &pool,
        &[b.clone(), c.clone(), "missing".into(), b.clone(), d.clone()],
    )
    .await
    .expect("resolve");
    assert_eq!(resolved.data.len(), 5);
    assert_eq!(resolved.data[0].canonical_id.as_deref(), Some(a.as_str()));
    assert_eq!(resolved.data[1].canonical_id, Some(c));
    assert_eq!(resolved.data[2].canonical_id, None);
    assert_eq!(resolved.data[3].canonical_id.as_deref(), Some(a.as_str()));
    assert_eq!(resolved.data[4].canonical_id, Some(d));
    assert_eq!(resolved.revision, merged.revision);
    let (status, value) = api(&pool, Method::GET, &format!("/entities/{b}"), Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["data"]["id"], a);
    let (status, value) = api(
        &pool,
        Method::POST,
        "/search",
        json!({"query":{"text":"Ada"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(value["hits"].as_array().expect("hits").len(), 1);
    assert_eq!(
        value["hits"][0]["uri"],
        format!("pops:contacts/contact/{a}")
    );
}

#[tokio::test]
async fn rejected_candidate_expands_stable_pairs_and_leaves_other_candidate_pending() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C").await;
    let d = person(&pool, "D").await;
    service::merge(&pool, request(&pool, &a, &[&b], "ab").await)
        .await
        .expect("selected merge");
    decisions::decide(
        &pool,
        SeparateBody {
            left_id: a.clone(),
            right_id: c.clone(),
            keep_separate: true,
            expected_revision: revision(&pool).await,
            idempotency_key: "reject-c".into(),
            evidence: "Different people".into(),
        },
    )
    .await
    .expect("rejection");
    let pairs = repo::separate_pairs(&pool).await.expect("pairs");
    assert_eq!(pairs.data.len(), 2);
    for pair in &pairs.data {
        assert!(pair.left_id != d && pair.right_id != d);
    }
    let before = revision(&pool).await;
    assert!(matches!(
        service::merge(&pool, request(&pool, &a, &[&c], "bad-ac").await).await,
        Err(repo::MergeError::Conflict { .. })
    ));
    assert_eq!(revision(&pool).await, before);
    assert_eq!(
        repo::group(&pool, &d).await.expect("pending").member_ids,
        vec![d]
    );
    assert_eq!(
        repo::group(&pool, &c).await.expect("separate").member_ids,
        vec![c]
    );
}

#[tokio::test]
async fn invalid_selection_and_mid_transaction_failure_roll_back_every_redirect() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C").await;
    let mut invalid = request(&pool, &a, &[&b], "invalid").await;
    invalid.selections.push(FieldSelection {
        field: MergeField::Name,
        entity_id: c.clone(),
    });
    let before = revision(&pool).await;
    assert!(matches!(
        service::merge(&pool, invalid).await,
        Err(repo::MergeError::Invalid(_))
    ));
    assert_eq!(revision(&pool).await, before);
    let mut invalid = request(&pool, &a, &[&b], "invalid-point").await;
    invalid.preferred_point_ids.push("missing".into());
    assert!(matches!(
        service::merge(&pool, invalid).await,
        Err(repo::MergeError::Invalid(_))
    ));
    sqlx::query("CREATE TRIGGER fail_second_redirect BEFORE INSERT ON entity_redirects WHEN (SELECT COUNT(*) FROM entity_redirects)>0 BEGIN SELECT RAISE(ABORT,'injected failure'); END")
        .execute(&pool).await.expect("failure injection");
    assert!(
        service::merge(&pool, request(&pool, &a, &[&b, &c], "rollback").await)
            .await
            .is_err()
    );
    assert_eq!(revision(&pool).await, before);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entity_redirects")
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 0);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM identity_receipts")
        .fetch_one(&pool)
        .await
        .expect("receipts");
    assert_eq!(count, 0);
}

#[tokio::test]
async fn receipts_replay_exact_result_and_conflict_on_key_body_mismatch() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let original = request(&pool, &a, &[&b], "receipt").await;
    let serialized = serde_json::to_string(&original).expect("serialize");
    let result = service::merge(&pool, original).await.expect("merge");
    person(&pool, "Unrelated later write").await;
    let replay = service::merge(&pool, serde_json::from_str(&serialized).expect("body"))
        .await
        .expect("retry");
    assert_eq!(replay.operation_id, result.operation_id);
    assert_eq!(replay.revision, result.revision);
    let mut changed: MergeBody = serde_json::from_str(&serialized).expect("body");
    changed.evidence = "Changed evidence".into();
    assert!(matches!(
        service::merge(&pool, changed).await,
        Err(repo::MergeError::Conflict { .. })
    ));
    assert!(
        sqlx::query("UPDATE merge_operations SET request_body='changed'")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(sqlx::query("DELETE FROM identity_receipts")
        .execute(&pool)
        .await
        .is_err());
}

#[tokio::test]
async fn optimistic_race_permits_only_one_selected_merge() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C").await;
    let first = request(&pool, &a, &[&b], "first").await;
    let second = request(&pool, &a, &[&c], "second").await;
    let (first, second) = tokio::join!(service::merge(&pool, first), service::merge(&pool, second));
    assert_ne!(first.is_ok(), second.is_ok());
    assert!(
        matches!(first, Err(repo::MergeError::Conflict { .. }))
            || matches!(second, Err(repo::MergeError::Conflict { .. }))
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entity_redirects")
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 1);
}

#[tokio::test]
async fn missing_mixed_type_retired_and_cyclic_requests_never_change_membership() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let company = person(&pool, "Company").await;
    sqlx::query("UPDATE entities SET type='company' WHERE id=?1")
        .bind(&company)
        .execute(&pool)
        .await
        .expect("type");
    assert!(matches!(
        service::merge(&pool, request(&pool, &a, &[&company], "mixed").await).await,
        Err(repo::MergeError::Invalid(_))
    ));
    assert!(matches!(
        service::merge(&pool, request(&pool, &a, &["missing"], "missing").await).await,
        Err(repo::MergeError::NotFound(_))
    ));
    service::merge(&pool, request(&pool, &a, &[&b], "ab").await)
        .await
        .expect("merge");
    assert!(matches!(
        service::merge(&pool, request(&pool, &b, &[&a], "cycle").await).await,
        Err(repo::MergeError::Conflict { .. })
    ));
    assert!(
        sqlx::query("INSERT INTO entity_redirects(member_id,canonical_id) VALUES(?1,?2)")
            .bind(&a)
            .bind(&b)
            .execute(&pool)
            .await
            .is_err()
    );
    let (status, error) = api(
        &pool,
        Method::PATCH,
        &format!("/entities/{b}"),
        json!({"name":"Wrong target"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(error["details"]["canonicalId"], a);
    let (status, _) = api(
        &pool,
        Method::DELETE,
        &format!("/entities/{a}"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn undo_restores_previous_groups_and_selections_and_replays_without_overwriting() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C").await;
    let mut first = request(&pool, &a, &[&b], "ab").await;
    first.selections.push(FieldSelection {
        field: MergeField::Name,
        entity_id: b.clone(),
    });
    service::merge(&pool, first).await.expect("first");
    let mut second = request(&pool, &c, &[&a], "cab").await;
    second.selections.push(FieldSelection {
        field: MergeField::Name,
        entity_id: a.clone(),
    });
    let result = service::merge(&pool, second).await.expect("second");
    let body = UndoBody {
        expected_revision: result.revision,
        idempotency_key: "undo".into(),
    };
    let serialized = serde_json::to_string(&body).expect("body");
    let undone = service::undo(&pool, &result.operation_id, body)
        .await
        .expect("undo");
    assert_eq!(repo::group(&pool, &b).await.expect("ab").canonical_id, a);
    assert_eq!(repo::group(&pool, &c).await.expect("c").member_ids, vec![c]);
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("get")
            .expect("entity")
            .name,
        "B"
    );
    let replay = service::undo(
        &pool,
        &result.operation_id,
        serde_json::from_str(&serialized).expect("body"),
    )
    .await
    .expect("replay");
    assert_eq!(replay.operation_id, undone.operation_id);
    assert!(service::undo(
        &pool,
        &result.operation_id,
        UndoBody {
            expected_revision: revision(&pool).await,
            idempotency_key: "another-undo".into()
        }
    )
    .await
    .is_err());
}

#[tokio::test]
async fn later_entity_address_and_observation_edits_fence_undo() {
    for kind in ["entity", "address", "source"] {
        let pool = pool().await;
        let a = person(&pool, "A").await;
        let b = person(&pool, "B").await;
        let result = service::merge(&pool, request(&pool, &a, &[&b], "merge").await)
            .await
            .expect("merge");
        match kind {
            "entity" => {
                sqlx::query("UPDATE entities SET notes='later' WHERE id=?1")
                    .bind(&a)
                    .execute(&pool)
                    .await
                    .expect("edit");
            }
            "address" => {
                addresses_repo::create(
                    &pool,
                    &a,
                    CreateAddressBody {
                        value: "later".into(),
                    },
                )
                .await
                .expect("address");
            }
            _ => {
                sqlx::query("INSERT INTO source_accounts(id,provider,account_key,created_at) VALUES('source','test','test','now')").execute(&pool).await.expect("source");
            }
        }
        assert!(matches!(
            service::undo(
                &pool,
                &result.operation_id,
                UndoBody {
                    expected_revision: revision(&pool).await,
                    idempotency_key: "undo".into()
                }
            )
            .await,
            Err(repo::MergeError::Conflict { .. })
        ));
        assert_eq!(repo::group(&pool, &b).await.expect("group").canonical_id, a);
    }
}

#[tokio::test]
async fn resolution_contract_reports_missing_and_caps_without_dropping_ids() {
    let pool = pool().await;
    let (status, value) = api(
        &pool,
        Method::POST,
        "/entities/resolve",
        json!({"ids":["missing","missing"]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        value["data"],
        json!([{"id":"missing","canonicalId":null},{"id":"missing","canonicalId":null}])
    );
    assert_eq!(value["revision"], 0);
    assert!(repo::resolve_many(&pool, &vec!["missing".into(); 501])
        .await
        .is_err());
    assert!(repo::resolve_many(&pool, &["".into()]).await.is_err());
    let (status, error) = api(
        &pool,
        Method::POST,
        "/entities/resolve",
        json!({"ids":[],"unexpected":true}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error["code"], "contacts.request.invalid");
    let (status, _) = api(
        &pool,
        Method::POST,
        "/merges",
        json!({"canonicalId":"missing"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
