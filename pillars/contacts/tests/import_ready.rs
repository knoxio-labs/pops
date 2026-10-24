//! Ready actions are derived from complete evidence and cannot partially apply a batch.

mod common;

use contacts::imports::model::{ImportBatch, ImportPayload, StageBatchInput, StageRowInput};
use contacts::imports::ready::{apply, summary};
use contacts::imports::ready_model::ReadyBatchInput;
use contacts::imports::review_decision_model::ReviewDecisionInput;
use contacts::imports::{review, review_decision_service, service};
use contacts::merges::repo as merges;
use contacts::persons::model::{ContactPointInput, ContactPointKind, NameCompleteness, PersonName};
use contacts::persons::repo as persons;
use contacts::sources::{model::SourceAccountInput, repo as sources};
use serde_json::json;
use sqlx::SqlitePool;

async fn setup() -> (SqlitePool, String) {
    let pool = contacts::db::connect("sqlite::memory:").await.unwrap();
    let account = account(&pool).await;
    (pool, account)
}
async fn account(pool: &SqlitePool) -> String {
    sources::create_or_get_account(
        pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "ready-fictional".into(),
            label: None,
        },
    )
    .await
    .unwrap()
    .id
}
fn email(value: &str) -> ContactPointInput {
    ContactPointInput {
        kind: ContactPointKind::Email,
        value: value.into(),
        label: None,
        country_code: None,
    }
}
fn name(given: &str, family: &str) -> PersonName {
    PersonName {
        given_name: Some(given.into()),
        family_name: Some(family.into()),
        completeness: NameCompleteness::Complete,
        ..Default::default()
    }
}
fn row(key: &str, display: &str, points: Vec<ContactPointInput>) -> StageRowInput {
    StageRowInput {
        record_key: key.into(),
        removed: false,
        errors: vec![],
        payload: Some(ImportPayload {
            display_name: Some(display.into()),
            name: PersonName::default(),
            points,
        }),
    }
}
async fn stage(pool: &SqlitePool, account: &str, rows: Vec<StageRowInput>) -> ImportBatch {
    service::stage(
        pool,
        &StageBatchInput {
            account_id: account.into(),
            collection_key: "ready".into(),
            rows,
        },
    )
    .await
    .unwrap()
}
async fn person(pool: &SqlitePool, display: &str, points: Vec<ContactPointInput>) -> String {
    let mut tx = pool.begin().await.unwrap();
    let id = persons::create_person(&mut tx, display).await.unwrap();
    for point in points {
        persons::insert_point(&mut tx, &id, &point, None)
            .await
            .unwrap();
    }
    tx.commit().await.unwrap();
    id
}
async fn input(pool: &SqlitePool, batch: &ImportBatch, key: &str) -> ReadyBatchInput {
    let page = review::get(pool, &batch.id, &Default::default())
        .await
        .unwrap();
    ReadyBatchInput {
        batch_revision: page.batch_revision,
        directory_revision: page.directory_revision,
        proposal_revision: page.ready.proposal_revision,
        idempotency_key: key.into(),
    }
}
async fn count(pool: &SqlitePool, table: &'static str) -> i64 {
    match table {
        "entities" => sqlx::query_scalar("SELECT COUNT(*) FROM entities")
            .fetch_one(pool)
            .await
            .unwrap(),
        "sources" => sqlx::query_scalar("SELECT COUNT(*) FROM source_records")
            .fetch_one(pool)
            .await
            .unwrap(),
        "merges" => sqlx::query_scalar("SELECT COUNT(*) FROM merge_operations")
            .fetch_one(pool)
            .await
            .unwrap(),
        "receipts" => sqlx::query_scalar("SELECT COUNT(*) FROM contact_import_ready_receipts")
            .fetch_one(pool)
            .await
            .unwrap(),
        _ => panic!("unknown fixture count"),
    }
}

#[tokio::test]
async fn three_exact_matches_and_a_new_first_name_import_in_one_atomic_action() {
    let (pool, account) = setup().await;
    let email_owner = person(&pool, "Email local", vec![email("same@example.test")]).await;
    let phone = ContactPointInput {
        kind: ContactPointKind::Phone,
        value: "+61412345678".into(),
        label: None,
        country_code: None,
    };
    let phone_owner = person(&pool, "Phone local", vec![phone.clone()]).await;
    let named_owner = person(&pool, "Preferred label", vec![]).await;
    persons::put_profile(&pool, &named_owner, name("Morgan", "Vale"))
        .await
        .unwrap();
    let preferred = persons::list_points(&pool, &email_owner)
        .await
        .unwrap()
        .remove(0);
    persons::prefer_point(&pool, &email_owner, &preferred.id)
        .await
        .unwrap();
    let mut named = row("name", "Morgan Vale", vec![]);
    named.payload.as_mut().unwrap().name = name("Morgan", "Vale");
    let batch = stage(
        &pool,
        &account,
        vec![
            row(
                "email",
                "Imported email label",
                vec![email("same@example.test")],
            ),
            row("phone", "Imported phone label", vec![phone]),
            named,
            row("sam", "Sam", vec![]),
        ],
    )
    .await;
    let before = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (
            before.eligible_rows,
            before.automatic_merges,
            before.new_people
        ),
        (4, 3, 1)
    );
    let request = input(&pool, &batch, "ready-all").await;
    let receipt = apply(&pool, &batch.id, &request).await.unwrap();
    assert_eq!(receipt.rows.len(), 4);
    assert_eq!(receipt.batch_revision, batch.revision + 1);
    for (ordinal, owner) in [email_owner.clone(), phone_owner, named_owner]
        .iter()
        .enumerate()
    {
        assert_eq!(
            receipt.rows[ordinal].entity_id.as_deref(),
            Some(owner.as_str())
        );
        assert!(receipt.rows[ordinal].operation_id.is_some());
        assert_eq!(
            merges::resolve_one(&mut pool.acquire().await.unwrap(), owner)
                .await
                .unwrap()
                .as_ref(),
            Some(owner)
        );
    }
    assert_eq!(count(&pool, "merges").await, 3);
    assert_eq!(count(&pool, "sources").await, 4);
    assert_eq!(
        contacts::entities::repo::get(&pool, &email_owner)
            .await
            .unwrap()
            .unwrap()
            .name,
        "Email local"
    );
    assert!(persons::list_points(&pool, &email_owner)
        .await
        .unwrap()
        .iter()
        .any(|point| point.id == preferred.id && point.preferred));
    assert!(service::get(&pool, &batch.id)
        .await
        .unwrap()
        .rows
        .iter()
        .all(|row| row.processed));
    let replay = apply(&pool, &batch.id, &request).await.unwrap();
    assert_eq!(
        serde_json::to_value(&receipt).unwrap(),
        serde_json::to_value(replay).unwrap()
    );
    assert_eq!(count(&pool, "receipts").await, 1);
    let mut changed = request.clone();
    changed.directory_revision += 1;
    assert!(matches!(
        apply(&pool, &batch.id, &changed).await,
        Err(service::ImportError::Conflict(_))
    ));
}

#[tokio::test]
async fn ambiguity_and_incomplete_name_potential_duplicates_remain_pending() {
    let (pool, account) = setup().await;
    person(&pool, "Twin A", vec![email("shared@example.test")]).await;
    person(&pool, "Twin B", vec![email("shared@example.test")]).await;
    person(&pool, "Alex", vec![]).await;
    let batch = stage(
        &pool,
        &account,
        vec![
            row("shared", "Incoming", vec![email("shared@example.test")]),
            row("alex", "Alex", vec![]),
            row("new", "Sam", vec![]),
        ],
    )
    .await;
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (ready.eligible_rows, ready.new_people, ready.review_required),
        (1, 1, 2)
    );
    let receipt = apply(&pool, &batch.id, &input(&pool, &batch, "mixed").await)
        .await
        .unwrap();
    assert_eq!(receipt.rows.len(), 1);
    assert_eq!(receipt.rows[0].row_id, batch.rows[2].id);
    let after = service::get(&pool, &batch.id).await.unwrap();
    assert!(!after.rows[0].processed && !after.rows[1].processed && after.rows[2].processed);
}

#[tokio::test]
async fn explicit_later_and_partial_merge_history_are_never_reclassified_as_ready() {
    let (pool, account) = setup().await;
    let a = person(&pool, "Candidate A", vec![email("shared@example.test")]).await;
    let b = person(&pool, "Candidate B", vec![email("shared@example.test")]).await;
    let c = person(&pool, "Candidate C", vec![email("shared@example.test")]).await;
    let batch = stage(
        &pool,
        &account,
        vec![
            row("partial", "Incoming", vec![email("shared@example.test")]),
            row("safe", "Sam", vec![]),
        ],
    )
    .await;
    let mut tx = pool.begin().await.unwrap();
    let auth = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&batch.rows[0].id)
        .unwrap();
    tx.commit().await.unwrap();
    let decision = ReviewDecisionInput {
        batch_revision: auth.batch_revision,
        directory_revision: auth.directory_revision,
        proposal_revision: auth.proposal_revision,
        row_id: batch.rows[0].id.clone(),
        idempotency_key: "partial".into(),
        merge_entity_ids: vec![a],
        different_entity_ids: vec![b.clone()],
        later_entity_ids: vec![c.clone()],
        selections: vec![],
        preferred_point_ids: vec![],
        incoming_fields: Vec::new(),
    };
    let partial = review_decision_service::decide(&pool, &batch.id, &decision)
        .await
        .unwrap();
    assert!(!partial.processed);
    let state_before =
        contacts::imports::review_state::get(&mut pool.acquire().await.unwrap(), &batch.rows[0].id)
            .await
            .unwrap()
            .unwrap();
    let negatives = merges::separate_pairs(&pool).await.unwrap().data.len();
    let before_merges = count(&pool, "merges").await;
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!((ready.eligible_rows, ready.deferred), (1, 1));
    let receipt = apply(&pool, &batch.id, &input(&pool, &batch, "remaining").await)
        .await
        .unwrap();
    assert_eq!(receipt.rows.len(), 1);
    let state_after =
        contacts::imports::review_state::get(&mut pool.acquire().await.unwrap(), &batch.rows[0].id)
            .await
            .unwrap()
            .unwrap();
    assert_eq!(
        serde_json::to_value(state_before).unwrap(),
        serde_json::to_value(state_after).unwrap()
    );
    assert_eq!(
        merges::separate_pairs(&pool).await.unwrap().data.len(),
        negatives
    );
    assert_eq!(count(&pool, "merges").await, before_merges);
    assert_eq!(partial.pending_entity_ids, vec![c]);
}

#[tokio::test]
async fn pending_other_batches_hold_collisions_and_invalidate_old_global_ready_proofs() {
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![row("one", "One", vec![email("cross@example.test")])],
    )
    .await;
    let request = input(&pool, &batch, "old-proof").await;
    let other = stage(
        &pool,
        &account,
        vec![row("two", "Two", vec![email("cross@example.test")])],
    )
    .await;
    assert!(matches!(
        apply(&pool, &batch.id, &request).await,
        Err(service::ImportError::Conflict(_))
    ));
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!((ready.eligible_rows, ready.review_required), (0, 1));
    let other_ready = summary(&mut pool.acquire().await.unwrap(), &other.id)
        .await
        .unwrap();
    assert_eq!(other_ready.eligible_rows, 0);
    assert_eq!(count(&pool, "entities").await, 0);
}

#[tokio::test]
async fn late_ready_receipt_failure_rolls_back_people_sources_merges_and_child_receipts() {
    let (pool, account) = setup().await;
    person(&pool, "Existing", vec![email("same@example.test")]).await;
    let batch = stage(
        &pool,
        &account,
        vec![
            row("match", "Imported", vec![email("same@example.test")]),
            row("new", "Sam", vec![]),
        ],
    )
    .await;
    let request = input(&pool, &batch, "late").await;
    sqlx::query("CREATE TRIGGER fail_ready_receipt BEFORE INSERT ON contact_import_ready_receipts BEGIN SELECT RAISE(ABORT,'fixture late failure'); END").execute(&pool).await.unwrap();
    assert!(matches!(
        apply(&pool, &batch.id, &request).await,
        Err(service::ImportError::Storage)
    ));
    assert_eq!(count(&pool, "entities").await, 1);
    assert_eq!(count(&pool, "sources").await, 0);
    assert_eq!(count(&pool, "merges").await, 0);
    assert_eq!(count(&pool, "receipts").await, 0);
    let child_receipts: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM contact_import_review_receipts")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(child_receipts, 0);
    assert!(service::get(&pool, &batch.id)
        .await
        .unwrap()
        .rows
        .iter()
        .all(|row| !row.processed));
    sqlx::query("DROP TRIGGER fail_ready_receipt")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        apply(&pool, &batch.id, &request).await.unwrap().rows.len(),
        2
    );
}

#[tokio::test]
async fn pure_later_does_not_ingest_and_true_new_first_name_remains_ready() {
    let (pool, account) = setup().await;
    let existing = person(&pool, "Existing", vec![email("later@example.test")]).await;
    let batch = stage(
        &pool,
        &account,
        vec![
            row("held", "Incoming", vec![email("later@example.test")]),
            row("new", "Sam", vec![]),
        ],
    )
    .await;
    let mut tx = pool.begin().await.unwrap();
    let authorization = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&batch.rows[0].id)
        .unwrap();
    tx.commit().await.unwrap();
    review_decision_service::decide(
        &pool,
        &batch.id,
        &ReviewDecisionInput {
            batch_revision: authorization.batch_revision,
            directory_revision: authorization.directory_revision,
            proposal_revision: authorization.proposal_revision,
            row_id: batch.rows[0].id.clone(),
            idempotency_key: "later".into(),
            merge_entity_ids: vec![],
            different_entity_ids: vec![],
            later_entity_ids: vec![existing],
            selections: vec![],
            preferred_point_ids: vec![],
            incoming_fields: Vec::new(),
        },
    )
    .await
    .unwrap();
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (
            ready.eligible_rows,
            ready.new_people,
            ready.deferred,
            ready.review_required
        ),
        (1, 1, 1, 0)
    );
    assert_eq!(
        apply(&pool, &batch.id, &input(&pool, &batch, "only-new").await)
            .await
            .unwrap()
            .rows
            .len(),
        1
    );
    let state =
        contacts::imports::review_state::get(&mut pool.acquire().await.unwrap(), &batch.rows[0].id)
            .await
            .unwrap()
            .unwrap();
    assert!(state.entity_id.is_none() && state.source_record_id.is_none());
    assert!(!service::get(&pool, &batch.id).await.unwrap().rows[0].processed);
}

#[tokio::test]
async fn source_refresh_and_removal_dispatch_exact_actions_and_preserve_original_owners() {
    let (pool, account) = setup().await;
    let original = stage(
        &pool,
        &account,
        vec![
            row("refresh", "Original", vec![email("old@example.test")]),
            row("remove", "Remove", vec![]),
        ],
    )
    .await;
    let seeded = apply(&pool, &original.id, &input(&pool, &original, "seed").await)
        .await
        .unwrap();
    let owner = seeded.rows[0].entity_id.clone().unwrap();
    let batch = stage(
        &pool,
        &account,
        vec![
            row(
                "refresh",
                "Provider changed",
                vec![email("new@example.test")],
            ),
            StageRowInput {
                record_key: "remove".into(),
                payload: None,
                removed: true,
                errors: vec![],
            },
        ],
    )
    .await;
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (
            ready.eligible_rows,
            ready.source_updates,
            ready.source_removals,
            ready.automatic_merges
        ),
        (2, 1, 1, 0)
    );
    let applied = apply(
        &pool,
        &batch.id,
        &input(&pool, &batch, "source-actions").await,
    )
    .await
    .unwrap();
    assert_eq!(applied.rows[0].entity_id.as_deref(), Some(owner.as_str()));
    assert!(applied.rows.iter().all(|row| row.operation_id.is_none()));
    assert_eq!(count(&pool, "entities").await, 2);
    let points = persons::list_points(&pool, &owner).await.unwrap();
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].value, "new@example.test");
    assert_eq!(points[0].entity_id, owner);
    let removed: bool = sqlx::query_scalar(
        "SELECT active FROM source_records WHERE account_id=?1 AND record_key='remove'",
    )
    .bind(&account)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!removed);
}

#[tokio::test]
async fn provider_account_fences_prevent_application_but_exact_receipts_survive_disconnect() {
    let (pool, account) = setup().await;
    let old = stage(&pool, &account, vec![row("before-provider", "Sam", vec![])]).await;
    let stale = input(&pool, &old, "old-file").await;
    sqlx::query("INSERT INTO provider_accounts(account_id,provider,owner_subject,epoch,connected,credential) VALUES(?1,'google','fixture-human',1,1,X'00')").bind(&account).execute(&pool).await.unwrap();
    assert!(matches!(
        apply(&pool, &old.id, &stale).await,
        Err(service::ImportError::Conflict(_))
    ));
    assert_eq!(count(&pool, "entities").await, 0);
    let fresh = stage(&pool, &account, vec![row("provider", "Taylor", vec![])]).await;
    let request = input(&pool, &fresh, "fresh-provider").await;
    let receipt = apply(&pool, &fresh.id, &request).await.unwrap();
    sqlx::query("UPDATE provider_accounts SET connected=0,credential=NULL,epoch=epoch+1 WHERE account_id=?1").bind(&account).execute(&pool).await.unwrap();
    let replay = apply(&pool, &fresh.id, &request).await.unwrap();
    assert_eq!(
        serde_json::to_value(receipt).unwrap(),
        serde_json::to_value(replay).unwrap()
    );
    let mut changed = request;
    changed.idempotency_key = "not-a-retry".into();
    assert!(matches!(
        apply(&pool, &fresh.id, &changed).await,
        Err(service::ImportError::Conflict(_))
    ));
}

#[tokio::test]
async fn wal_snapshot_proof_rejects_directory_and_pending_batch_writers() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp");
    std::fs::create_dir_all(&root).unwrap();
    let directory = root.join(format!("ready-wal-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let pool = contacts::db::connect(&format!(
        "sqlite:{}",
        directory.join("ready.sqlite").display()
    ))
    .await
    .unwrap();
    let account = account(&pool).await;
    let batch = stage(
        &pool,
        &account,
        vec![row("one", "Incoming", vec![email("race@example.test")])],
    )
    .await;
    let mut reader = pool.begin().await.unwrap();
    let before = summary(&mut reader, &batch.id).await.unwrap();
    let directory_revision = merges::revision(&mut reader).await.unwrap();
    let concurrent = person(&pool, "Concurrent", vec![email("race@example.test")]).await;
    stage(
        &pool,
        &account,
        vec![row(
            "two",
            "Other pending",
            vec![email("race@example.test")],
        )],
    )
    .await;
    assert_eq!(
        before.proposal_revision,
        summary(&mut reader, &batch.id)
            .await
            .unwrap()
            .proposal_revision
    );
    reader.commit().await.unwrap();
    let request = ReadyBatchInput {
        batch_revision: batch.revision,
        directory_revision,
        proposal_revision: before.proposal_revision,
        idempotency_key: "stale-wal".into(),
    };
    assert!(matches!(
        apply(&pool, &batch.id, &request).await,
        Err(service::ImportError::Conflict(_))
    ));
    assert_eq!(count(&pool, "entities").await, 1);
    assert_eq!(
        merges::resolve_one(&mut pool.acquire().await.unwrap(), &concurrent)
            .await
            .unwrap()
            .as_deref(),
        Some(concurrent.as_str())
    );
    assert_eq!(count(&pool, "sources").await, 0);
    pool.close().await;
    std::fs::remove_dir_all(directory).unwrap();
}

#[tokio::test]
async fn blank_display_does_not_hide_existing_complete_name_potential_duplicate() {
    let (pool, account) = setup().await;
    let existing = person(&pool, "Legacy label", vec![]).await;
    sources::apply_record(
        &mut pool.acquire().await.unwrap(),
        &contacts::sources::model::SourceRecordInput {
            account_id: account.clone(),
            collection_key: "existing".into(),
            record_key: "blank-display".into(),
            entity_id: existing,
            display_name: Some(" ".into()),
            name: name("Jane", "Doe"),
            points: vec![],
        },
    )
    .await
    .unwrap();
    let batch = stage(&pool, &account, vec![row("incomplete", "Jane Doe", vec![])]).await;
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (ready.eligible_rows, ready.new_people, ready.review_required),
        (0, 0, 1)
    );
}

#[tokio::test]
async fn ready_http_contract_is_required_typed_and_rejects_forged_targets() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (pool, account) = setup().await;
    let batch = stage(&pool, &account, vec![row("new", "Sam", vec![])]).await;
    let request = input(&pool, &batch, "http").await;
    let router = contacts::app::build_router(contacts::app::AppState {
        pool: pool.clone(),
        version: "test".into(),
        service_account_scope_verifier: common::service_account_scope_verifier(),
    });
    let mut forged = serde_json::to_value(&request).unwrap();
    forged["entityId"] = json!("forged");
    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/imports/{}/apply-ready", batch.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&forged).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(count(&pool, "entities").await, 0);
    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/imports/{}/apply-ready", batch.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let spec = contacts::openapi::openapi_30_value();
    assert_eq!(
        spec["paths"]["/imports/{id}/apply-ready"]["post"]["operationId"],
        "imports.ready.apply"
    );
    let required = spec["components"]["schemas"]["ImportReview"]["required"]
        .as_array()
        .unwrap();
    assert!(required.contains(&json!("ready")));
    let decision = &spec["components"]["schemas"]["ReviewDecisionInput"];
    assert_eq!(decision["properties"]["incomingFields"]["type"], "array");
    assert!(!decision["required"]
        .as_array()
        .unwrap()
        .contains(&json!("incomingFields")));
}

#[tokio::test]
async fn superseded_provider_scan_blocks_ready_action_without_partial_ingestion() {
    let (pool, account) = setup().await;
    sqlx::query("INSERT INTO provider_accounts(account_id,provider,owner_subject,epoch,connected,credential) VALUES(?1,'google','fixture-human',1,1,X'00')").bind(&account).execute(&pool).await.unwrap();
    for run in ["first-run", "second-run"] {
        sqlx::query("INSERT INTO provider_sync_runs(id,account_id,account_epoch,status,started_at) VALUES(?1,?2,1,'completed','fixture-time')").bind(run).bind(&account).execute(&pool).await.unwrap();
    }
    let batch = stage(&pool, &account, vec![row("scan", "Sam", vec![])]).await;
    sqlx::query("INSERT INTO provider_collection_states(account_id,collection_key,latest_run_id) VALUES(?1,'ready','first-run')").bind(&account).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO provider_batch_guards(batch_id,run_id) VALUES(?1,'first-run')")
        .bind(&batch.id)
        .execute(&pool)
        .await
        .unwrap();
    let request = input(&pool, &batch, "first-scan").await;
    sqlx::query("UPDATE provider_collection_states SET latest_run_id='second-run' WHERE account_id=?1 AND collection_key='ready'").bind(&account).execute(&pool).await.unwrap();
    assert!(matches!(
        apply(&pool, &batch.id, &request).await,
        Err(service::ImportError::Conflict(_))
    ));
    assert_eq!(count(&pool, "entities").await, 0);
    assert_eq!(count(&pool, "sources").await, 0);
    assert_eq!(count(&pool, "receipts").await, 0);
    assert_eq!(
        summary(&mut pool.acquire().await.unwrap(), &batch.id)
            .await
            .unwrap()
            .eligible_rows,
        0
    );
}

#[tokio::test]
async fn duplicate_observations_in_the_same_batch_are_held_and_receipts_are_immutable() {
    let (pool, account) = setup().await;
    person(&pool, "Existing", vec![email("shared@example.test")]).await;
    let batch = stage(
        &pool,
        &account,
        vec![
            row("first", "First", vec![email("shared@example.test")]),
            row("second", "Second", vec![email("shared@example.test")]),
            row("new", "Sam", vec![]),
        ],
    )
    .await;
    let ready = summary(&mut pool.acquire().await.unwrap(), &batch.id)
        .await
        .unwrap();
    assert_eq!(
        (
            ready.eligible_rows,
            ready.automatic_merges,
            ready.review_required
        ),
        (1, 0, 2)
    );
    let request = input(&pool, &batch, "same-batch").await;
    let receipt = apply(&pool, &batch.id, &request).await.unwrap();
    assert_eq!(receipt.rows.len(), 1);
    assert_eq!(receipt.rows[0].row_id, batch.rows[2].id);
    assert_eq!(count(&pool, "merges").await, 0);
    assert!(
        sqlx::query("UPDATE contact_import_ready_receipts SET receipt='{}' WHERE batch_id=?1")
            .bind(&batch.id)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM contact_import_ready_receipts WHERE batch_id=?1")
            .bind(&batch.id)
            .execute(&pool)
            .await
            .is_err()
    );
    let retry = apply(&pool, &batch.id, &request).await.unwrap();
    assert_eq!(
        serde_json::to_value(receipt).unwrap(),
        serde_json::to_value(retry).unwrap()
    );
}
