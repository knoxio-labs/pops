//! Merge undo restores the local fact decisions and preference ownership its selections displaced.

use contacts::{
    db,
    merges::{
        model::{FieldSelection, MergeBody, MergeField, UndoBody},
        repo::{self, MergeError},
        service,
    },
    persons::{
        facts_model::{FactChange, FactChangeBody, FactUndoBody},
        facts_service,
        model::{ContactPointInput, ContactPointKind},
        repo as persons,
    },
};
use sqlx::SqlitePool;

async fn revision(pool: &SqlitePool) -> i64 {
    repo::revision(&mut pool.acquire().await.unwrap())
        .await
        .unwrap()
}

fn email(value: &str) -> ContactPointInput {
    ContactPointInput {
        kind: ContactPointKind::Email,
        value: value.into(),
        label: None,
        country_code: None,
    }
}

async fn setup() -> (SqlitePool, String, String, String, String) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    let a = persons::create_person(&mut tx, "Original A").await.unwrap();
    let b = persons::create_person(&mut tx, "Original B").await.unwrap();
    sqlx::query("UPDATE entities SET notes='A notes' WHERE id=?1")
        .bind(&a)
        .execute(&mut *tx)
        .await
        .unwrap();
    let a_point = persons::insert_point(&mut tx, &a, &email("a@example.test"), None)
        .await
        .unwrap();
    let b_point = persons::insert_point(&mut tx, &b, &email("b@example.test"), None)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let local = facts_service::apply(
        &pool,
        &b,
        FactChangeBody {
            expected_version: revision(&pool).await,
            idempotency_key: "local-b".into(),
            changes: vec![
                FactChange::SetEntity {
                    name: "Local B".into(),
                    notes: Some("Local B notes".into()),
                },
                FactChange::EditPoint {
                    point_id: b_point.id,
                    point: email("local-b@example.test"),
                },
            ],
        },
    )
    .await
    .unwrap();
    (pool, a, b, a_point.id, local.operation.id)
}

async fn merge_body(pool: &SqlitePool, a: &str, b: &str, a_point: &str) -> MergeBody {
    MergeBody {
        canonical_id: b.into(),
        member_ids: vec![a.into()],
        expected_revision: revision(pool).await,
        idempotency_key: "merge-a-into-b".into(),
        evidence: "Explicitly selected A's fields and preferred method".into(),
        selections: vec![
            FieldSelection::Entity {
                field: MergeField::Name,
                entity_id: a.into(),
            },
            FieldSelection::Entity {
                field: MergeField::Notes,
                entity_id: a.into(),
            },
        ],
        preferred_point_ids: vec![a_point.into()],
    }
}

#[tokio::test]
async fn immediate_merge_undo_restores_displaced_local_facts_and_their_undo_ownership() {
    let (pool, a, b, a_point, fact_operation) = setup().await;
    let before_version: i64 = sqlx::query_scalar("SELECT version FROM person_fact_selection_versions WHERE entity_id=?1 AND field='point:email'")
        .bind(&b).fetch_one(&pool).await.unwrap();
    let merged = service::merge(&pool, merge_body(&pool, &a, &b, &a_point).await)
        .await
        .unwrap();
    let selected = facts_service::get(&pool, &b).await.unwrap();
    assert_eq!(selected.entity.name, "Original A");
    assert_eq!(selected.entity.notes.as_deref(), Some("A notes"));
    service::undo(
        &pool,
        &merged.operation_id,
        UndoBody {
            expected_revision: merged.revision,
            idempotency_key: "undo-merge".into(),
        },
    )
    .await
    .unwrap();
    let restored = facts_service::get(&pool, &b).await.unwrap();
    assert_eq!(restored.entity.name, "Local B");
    assert_eq!(restored.entity.notes.as_deref(), Some("Local B notes"));
    assert!(restored
        .points
        .iter()
        .any(|point| point.value == "local-b@example.test" && point.preferred));
    assert!(restored
        .operations
        .iter()
        .any(|operation| operation.id == fact_operation && operation.can_undo));
    let after_version: i64 = sqlx::query_scalar("SELECT version FROM person_fact_selection_versions WHERE entity_id=?1 AND field='point:email'")
        .bind(&b).fetch_one(&pool).await.unwrap();
    assert!(after_version > before_version);
    let undone = facts_service::undo(
        &pool,
        &b,
        &fact_operation,
        FactUndoBody {
            expected_version: restored.version,
            idempotency_key: "undo-restored-facts".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(undone.data.entity.name, "Original B");
    assert_eq!(undone.data.entity.notes, None);
    assert_eq!(undone.data.points.len(), 1);
    assert_eq!(undone.data.points[0].value, "b@example.test");
}

#[tokio::test]
async fn a_later_fact_decision_still_blocks_merge_undo_and_preserves_the_foreign_write() {
    let (pool, a, b, a_point, _) = setup().await;
    let merged = service::merge(&pool, merge_body(&pool, &a, &b, &a_point).await)
        .await
        .unwrap();
    let foreign = facts_service::apply(
        &pool,
        &b,
        FactChangeBody {
            expected_version: revision(&pool).await,
            idempotency_key: "foreign-after-merge".into(),
            changes: vec![FactChange::SetEntity {
                name: "Foreign name".into(),
                notes: Some("Foreign notes".into()),
            }],
        },
    )
    .await
    .unwrap();
    let result = service::undo(
        &pool,
        &merged.operation_id,
        UndoBody {
            expected_revision: foreign.data.version,
            idempotency_key: "refuse-late-merge-undo".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(MergeError::Conflict { .. })));
    let current = facts_service::get(&pool, &b).await.unwrap();
    assert_eq!(current.version, foreign.data.version);
    assert_eq!(current.entity.name, "Foreign name");
    assert_eq!(current.entity.notes.as_deref(), Some("Foreign notes"));
    assert_eq!(
        repo::resolve_one(&mut pool.acquire().await.unwrap(), &a)
            .await
            .unwrap()
            .as_deref(),
        Some(b.as_str())
    );
}

#[tokio::test]
async fn a_legacy_merge_without_local_fact_evidence_refuses_to_guess_a_restoration() {
    let (pool, a, b, a_point, _) = setup().await;
    let merged = service::merge(&pool, merge_body(&pool, &a, &b, &a_point).await)
        .await
        .unwrap();
    sqlx::query("INSERT INTO merge_operations(id,canonical_id,member_ids,before_redirects,before_selections,request_body,post_revision,created_at) SELECT 'legacy-operation',canonical_id,member_ids,before_redirects,before_selections,request_body,post_revision,created_at FROM merge_operations WHERE id=?1")
        .bind(&merged.operation_id).execute(&pool).await.unwrap();
    let before = facts_service::get(&pool, &b).await.unwrap();
    let result = service::undo(
        &pool,
        "legacy-operation",
        UndoBody {
            expected_revision: before.version,
            idempotency_key: "legacy-facts-undo".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(MergeError::Conflict { .. })));
    let after = facts_service::get(&pool, &b).await.unwrap();
    assert_eq!(after.version, before.version);
    assert_eq!(after.entity, before.entity);
    assert_eq!(
        repo::resolve_one(&mut pool.acquire().await.unwrap(), &a)
            .await
            .unwrap()
            .as_deref(),
        Some(b.as_str())
    );
}

#[tokio::test]
async fn a_legacy_merge_without_fact_history_keeps_its_existing_undo_contract() {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    let a = persons::create_person(&mut tx, "Original A").await.unwrap();
    let b = persons::create_person(&mut tx, "Original B").await.unwrap();
    let point = persons::insert_point(&mut tx, &a, &email("a@example.test"), None)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let merged = service::merge(&pool, merge_body(&pool, &a, &b, &point.id).await)
        .await
        .unwrap();
    sqlx::query("INSERT INTO merge_operations(id,canonical_id,member_ids,before_redirects,before_selections,request_body,post_revision,created_at) SELECT 'legacy-no-facts',canonical_id,member_ids,before_redirects,before_selections,request_body,post_revision,created_at FROM merge_operations WHERE id=?1")
        .bind(&merged.operation_id).execute(&pool).await.unwrap();
    service::undo(
        &pool,
        "legacy-no-facts",
        UndoBody {
            expected_revision: merged.revision,
            idempotency_key: "legacy-no-facts-undo".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        facts_service::get(&pool, &b).await.unwrap().entity.name,
        "Original B"
    );
    assert_eq!(
        repo::resolve_one(&mut pool.acquire().await.unwrap(), &a)
            .await
            .unwrap()
            .as_deref(),
        Some(a.as_str())
    );
}
