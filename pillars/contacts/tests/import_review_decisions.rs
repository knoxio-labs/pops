//! Reviewed-row transactions must preserve independent candidate decisions and all-or-nothing writes.

use contacts::db;
use contacts::imports::model::{ImportPayload, StageBatchInput, StageRowInput};
use contacts::imports::review_decision_model::{ReviewDecisionInput, ReviewDecisionReceipt};
use contacts::imports::review_decision_service::decide;
use contacts::imports::review_state::{self, CandidateDecision};
use contacts::imports::service::{self, ImportError};
use contacts::merges::{repo as merges, service as merge_service};
use contacts::persons::model::{ContactPointInput, ContactPointKind, PersonName};
use contacts::sources::model::SourceAccountInput;
use sqlx::SqlitePool;

async fn setup() -> (SqlitePool, String) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let account = contacts::sources::repo::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "review".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    (pool, account.id)
}

async fn person(pool: &SqlitePool, name: &str) -> String {
    let mut tx = pool.begin().await.unwrap();
    let id = contacts::persons::repo::create_person(&mut tx, name)
        .await
        .unwrap();
    contacts::persons::repo::insert_point(
        &mut tx,
        &id,
        &ContactPointInput {
            kind: ContactPointKind::Email,
            value: "shared@example.test".into(),
            label: None,
            country_code: None,
        },
        None,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    id
}

async fn stage(pool: &SqlitePool, account: &str) -> contacts::imports::model::ImportBatch {
    service::stage(
        pool,
        &StageBatchInput {
            account_id: account.into(),
            collection_key: "contacts".into(),
            rows: vec![StageRowInput {
                record_key: "incoming".into(),
                payload: Some(ImportPayload {
                    display_name: Some("Incoming Person".into()),
                    name: PersonName::default(),
                    points: vec![ContactPointInput {
                        kind: ContactPointKind::Email,
                        value: "shared@example.test".into(),
                        label: None,
                        country_code: None,
                    }],
                }),
                removed: false,
                errors: vec![],
            }],
        },
    )
    .await
    .unwrap()
}

async fn input(pool: &SqlitePool, batch_id: &str, row_id: &str, key: &str) -> ReviewDecisionInput {
    let mut tx = pool.begin().await.unwrap();
    let snapshot = contacts::imports::review::snapshot(&mut tx, batch_id)
        .await
        .unwrap();
    let auth = snapshot.authorize(row_id).unwrap();
    tx.commit().await.unwrap();
    ReviewDecisionInput {
        batch_revision: auth.batch_revision,
        directory_revision: auth.directory_revision,
        proposal_revision: auth.proposal_revision,
        row_id: row_id.into(),
        idempotency_key: key.into(),
        merge_entity_ids: vec![],
        different_entity_ids: vec![],
        later_entity_ids: vec![],
        selections: vec![],
        preferred_point_ids: vec![],
    }
}

async fn assert_same(first: &ReviewDecisionReceipt, second: &ReviewDecisionReceipt) {
    assert_eq!(
        serde_json::to_value(first).unwrap(),
        serde_json::to_value(second).unwrap()
    );
}

#[tokio::test]
async fn subset_merge_rejects_one_and_retains_another_then_exact_replay_is_immutable() {
    let (pool, account) = setup().await;
    let a = person(&pool, "Candidate A").await;
    let b = person(&pool, "Candidate B").await;
    let c = person(&pool, "Candidate C").await;
    let d = person(&pool, "Candidate D").await;
    let batch = stage(&pool, &account).await;
    let row = &batch.rows[0];
    let mut body = input(&pool, &batch.id, &row.id, "subset").await;
    body.merge_entity_ids = vec![a.clone(), b.clone()];
    body.different_entity_ids = vec![c.clone()];
    body.later_entity_ids = vec![d.clone()];
    let receipt = decide(&pool, &batch.id, &body).await.unwrap();
    assert!(!receipt.processed);
    assert_eq!(
        receipt.pending_entity_ids.as_slice(),
        std::slice::from_ref(&d)
    );
    let incoming = receipt.entity_id.as_ref().unwrap();
    let mut conn = pool.acquire().await.unwrap();
    for id in [&a, &b] {
        assert_eq!(
            merges::resolve_one(&mut conn, id).await.unwrap().as_ref(),
            Some(incoming)
        );
    }
    for id in [&c, &d] {
        assert_eq!(
            merges::resolve_one(&mut conn, id).await.unwrap().as_ref(),
            Some(id)
        );
    }
    let state = review_state::get(&mut conn, &row.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(state.decisions[&c], CandidateDecision::Different);
    assert_eq!(state.decisions[&d], CandidateDecision::Later);
    let negatives: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM keep_separate")
        .fetch_one(&mut *conn)
        .await
        .unwrap();
    assert_eq!(negatives, 3);
    drop(conn);
    let replay = decide(&pool, &batch.id, &body).await.unwrap();
    assert_same(&receipt, &replay).await;
    let mut changed = body;
    changed.later_entity_ids.clear();
    assert!(matches!(
        decide(&pool, &batch.id, &changed).await,
        Err(ImportError::Conflict(_))
    ));
    let mut later = input(&pool, &batch.id, &row.id, "later").await;
    later.different_entity_ids = vec![d];
    let resolved = decide(&pool, &batch.id, &later).await.unwrap();
    assert!(resolved.processed);
    let people: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(people, 5);
}

#[tokio::test]
async fn stale_snapshot_and_untrusted_target_leave_all_state_untouched() {
    let (pool, account) = setup().await;
    let candidate = person(&pool, "Candidate").await;
    let batch = stage(&pool, &account).await;
    let mut body = input(&pool, &batch.id, &batch.rows[0].id, "stale").await;
    body.merge_entity_ids.push(candidate);
    person(&pool, "Directory changed").await;
    assert!(matches!(
        decide(&pool, &batch.id, &body).await,
        Err(ImportError::Conflict(_))
    ));
    let mut fresh = input(&pool, &batch.id, &batch.rows[0].id, "untrusted").await;
    fresh.merge_entity_ids.push("not-a-candidate".into());
    assert!(matches!(
        decide(&pool, &batch.id, &fresh).await,
        Err(ImportError::Invalid(_))
    ));
    let records: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM source_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(records, 0);
    assert_eq!(service::get(&pool, &batch.id).await.unwrap().revision, 1);
}

#[tokio::test]
async fn late_merge_failure_rolls_back_ingestion_negatives_receipts_and_revision() {
    let (pool, account) = setup().await;
    let a = person(&pool, "A").await;
    let c = person(&pool, "C").await;
    let batch = stage(&pool, &account).await;
    let mut body = input(&pool, &batch.id, &batch.rows[0].id, "rollback").await;
    body.merge_entity_ids = vec![a];
    body.different_entity_ids = vec![c];
    sqlx::query("CREATE TRIGGER fail_review_receipt BEFORE INSERT ON contact_import_review_receipts BEGIN SELECT RAISE(ABORT,'forced rollback'); END").execute(&pool).await.unwrap();
    assert!(matches!(
        decide(&pool, &batch.id, &body).await,
        Err(ImportError::Storage)
    ));
    let counts: (i64,i64,i64,i64,i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM entities),(SELECT COUNT(*) FROM source_records),(SELECT COUNT(*) FROM keep_separate),(SELECT COUNT(*) FROM merge_operations),(SELECT COUNT(*) FROM contact_import_review_states)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (2, 0, 0, 0, 0));
    let mut conn = pool.acquire().await.unwrap();
    assert_eq!(
        merges::revision(&mut conn).await.unwrap(),
        body.directory_revision
    );
    drop(conn);
    assert_eq!(service::get(&pool, &batch.id).await.unwrap().revision, 1);
    sqlx::query("DROP TRIGGER fail_review_receipt")
        .execute(&pool)
        .await
        .unwrap();
    let receipt = decide(&pool, &batch.id, &body).await.unwrap();
    assert!(receipt.processed);
    let undo = contacts::merges::model::UndoBody {
        expected_revision: receipt.directory_revision,
        idempotency_key: "undo".into(),
    };
    merge_service::undo(&pool, receipt.operation_id.as_ref().unwrap(), undo)
        .await
        .unwrap();
}

#[tokio::test]
async fn pure_defer_does_not_materialize_person_and_empty_choices_explicitly_ingest() {
    let (pool, account) = setup().await;
    let candidate = person(&pool, "Candidate").await;
    let batch = stage(&pool, &account).await;
    let mut body = input(&pool, &batch.id, &batch.rows[0].id, "defer").await;
    body.later_entity_ids = vec![candidate.clone()];
    let deferred = decide(&pool, &batch.id, &body).await.unwrap();
    assert!(deferred.entity_id.is_none());
    assert!(!deferred.processed);
    assert_eq!(deferred.directory_revision, body.directory_revision);
    let save = input(&pool, &batch.id, &batch.rows[0].id, "ingest").await;
    let saved = decide(&pool, &batch.id, &save).await.unwrap();
    assert!(saved.entity_id.is_some());
    assert!(!saved.processed);
    assert_eq!(saved.pending_entity_ids, [candidate]);
}

#[tokio::test]
async fn invalid_late_field_selection_rolls_back_source_and_negative_pairs() {
    let (pool, account) = setup().await;
    let selected = person(&pool, "Selected").await;
    let rejected = person(&pool, "Rejected").await;
    let batch = stage(&pool, &account).await;
    let mut body = input(&pool, &batch.id, &batch.rows[0].id, "invalid-field").await;
    body.merge_entity_ids = vec![selected];
    body.different_entity_ids = vec![rejected.clone()];
    body.selections = vec![contacts::merges::model::FieldSelection::Entity {
        field: contacts::merges::model::MergeField::Name,
        entity_id: rejected,
    }];
    assert!(matches!(
        decide(&pool, &batch.id, &body).await,
        Err(ImportError::Invalid(_))
    ));
    let counts: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM entities),(SELECT COUNT(*) FROM source_records),(SELECT COUNT(*) FROM keep_separate)").fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (2, 0, 0));
}

#[tokio::test]
async fn competing_review_revisions_allow_only_one_write() {
    let (pool, account) = setup().await;
    let batch = stage(&pool, &account).await;
    let first = input(&pool, &batch.id, &batch.rows[0].id, "first").await;
    let second = input(&pool, &batch.id, &batch.rows[0].id, "second").await;
    let (left, right) = tokio::join!(
        decide(&pool, &batch.id, &first),
        decide(&pool, &batch.id, &second)
    );
    assert!(matches!(
        (&left, &right),
        (Ok(_), Err(ImportError::Conflict(_))) | (Err(ImportError::Conflict(_)), Ok(_))
    ));
    let people: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(people, 1);
}

#[tokio::test]
async fn new_incoming_structured_profile_uses_retained_source_observation() {
    let (pool, account) = setup().await;
    let mut staged = StageBatchInput {
        account_id: account,
        collection_key: "contacts".into(),
        rows: vec![StageRowInput {
            record_key: "structured".into(),
            payload: Some(ImportPayload {
                display_name: Some("Original Display".into()),
                name: PersonName {
                    given_name: Some("Original".into()),
                    family_name: Some("Profile".into()),
                    ..PersonName::default()
                },
                points: vec![],
            }),
            removed: false,
            errors: vec![],
        }],
    };
    let batch = service::stage(&pool, &staged).await.unwrap();
    let body = input(&pool, &batch.id, &batch.rows[0].id, "structured").await;
    let receipt = decide(&pool, &batch.id, &body).await.unwrap();
    let id = receipt.entity_id.as_ref().unwrap();
    let profile = contacts::persons::repo::get_profile(&pool, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(profile.name.given_name.as_deref(), Some("Original"));
    let local_profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM person_profiles")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(local_profiles, 0);
    staged.rows[0].payload.as_mut().unwrap().name.given_name = Some("Upstream Changed".into());
    let refresh = service::stage(&pool, &staged).await.unwrap();
    service::commit(
        &pool,
        &refresh.id,
        &contacts::imports::model::CommitBatchInput {
            revision: 1,
            idempotency_key: "refresh".into(),
            decisions: vec![contacts::imports::model::RowDecision {
                row_id: refresh.rows[0].id.clone(),
                action: contacts::imports::model::RowAction::UpdateSource,
            }],
        },
    )
    .await
    .unwrap();
    let retained = contacts::persons::repo::get_profile(&pool, id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retained.name.given_name.as_deref(), Some("Original"));
}

#[tokio::test]
async fn negative_decisions_bound_expanded_member_pairs_before_ingestion() {
    let (pool, account) = setup().await;
    let mut roots = Vec::new();
    for group in 0..2 {
        let root = person(&pool, &format!("Group {group} root")).await;
        let mut members = Vec::new();
        for member in 1..100 {
            members.push(person(&pool, &format!("Group {group} member {member}")).await);
        }
        let revision = merges::revision(&mut pool.acquire().await.unwrap())
            .await
            .unwrap();
        merge_service::merge(
            &pool,
            contacts::merges::model::MergeBody {
                canonical_id: root.clone(),
                member_ids: members,
                expected_revision: revision,
                idempotency_key: format!("group-{group}"),
                evidence: "Explicit group fixture".into(),
                selections: vec![],
                preferred_point_ids: vec![],
            },
        )
        .await
        .unwrap();
        roots.push(root);
    }
    let batch = stage(&pool, &account).await;
    let mut body = input(&pool, &batch.id, &batch.rows[0].id, "expanded-pairs").await;
    body.merge_entity_ids = vec![roots[0].clone()];
    body.different_entity_ids = vec![roots[1].clone()];
    assert!(matches!(
        decide(&pool, &batch.id, &body).await,
        Err(ImportError::Invalid(_))
    ));
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM source_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
