//! Complete-snapshot identity decisions with bounded evidence responses.

use contacts::db;
use contacts::imports::model::{ImportPayload, StageBatchInput, StageRowInput};
use contacts::imports::review;
use contacts::imports::review_model::{ProposalReason, ReviewClassification, ReviewQuery};
use contacts::imports::service::{self, ImportError};
use contacts::persons::model::{ContactPointInput, ContactPointKind, PersonName};
use contacts::persons::repo as persons;
use contacts::sources::model::SourceAccountInput;
use contacts::sources::repo as sources;
use sqlx::SqlitePool;

async fn setup() -> (SqlitePool, String) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    let account = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "review-fixture".into(),
            label: Some("Fictional contacts".into()),
        },
    )
    .await
    .unwrap();
    (pool, account.id)
}

fn point(email: &str) -> ContactPointInput {
    ContactPointInput {
        kind: ContactPointKind::Email,
        value: email.into(),
        country_code: None,
        label: Some("Fixture".into()),
    }
}

fn incoming(key: &str, name: &str, email: &str) -> StageRowInput {
    StageRowInput {
        record_key: key.into(),
        removed: false,
        errors: Vec::new(),
        payload: Some(ImportPayload {
            display_name: Some(name.into()),
            name: PersonName::default(),
            points: vec![point(email)],
        }),
    }
}

async fn stage(
    pool: &SqlitePool,
    account: &str,
    rows: Vec<StageRowInput>,
) -> contacts::imports::model::ImportBatch {
    service::stage(
        pool,
        &StageBatchInput {
            account_id: account.into(),
            collection_key: "fixture".into(),
            rows,
        },
    )
    .await
    .unwrap()
}

async fn person(pool: &SqlitePool, name: &str, email: &str) -> String {
    let mut tx = pool.begin().await.unwrap();
    let id = persons::create_person(&mut tx, name).await.unwrap();
    persons::insert_point(&mut tx, &id, &point(email), None)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    id
}

#[tokio::test]
async fn unique_email_returns_real_evidence_and_unpaged_authorization() {
    let (pool, account) = setup().await;
    let id = person(&pool, "Existing fictional person", "same@example.test").await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming(
            "row-one",
            "Different display",
            "same@example.test",
        )],
    )
    .await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let row = &page.rows[0];
    assert_eq!(row.classification, ReviewClassification::Automatic);
    assert_eq!(row.reason, ProposalReason::Email);
    assert!(!row.stale_source);
    assert_eq!(row.candidates[0].entity_id.as_deref(), Some(id.as_str()));
    assert_eq!(row.candidates[0].points[0].value, "same@example.test");
    assert!(row.candidates[0].points[0].id.is_some());
    let mut tx = pool.begin().await.unwrap();
    let snapshot = review::snapshot(&mut tx, &batch.id).await.unwrap();
    let authorization = snapshot.authorize(&row.row_id).unwrap();
    assert_eq!(
        authorization.candidate_ids().collect::<Vec<_>>(),
        vec![id.as_str()]
    );
    assert_eq!(authorization.proposal_revision, row.proposal_revision);
    assert_ne!(row.proposal_revision, page.proposal_revision);
}

#[tokio::test]
async fn shared_identifiers_beyond_candidate_page_remain_ambiguous_and_authorized() {
    let (pool, account) = setup().await;
    for index in 0..201 {
        person(
            &pool,
            &format!("Fictional person {index}"),
            "shared@example.test",
        )
        .await;
    }
    let batch = stage(
        &pool,
        &account,
        vec![incoming("shared", "Incoming", "shared@example.test")],
    )
    .await;
    let query = ReviewQuery {
        candidate_limit: 200,
        ..ReviewQuery::default()
    };
    let page = review::get(&pool, &batch.id, &query).await.unwrap();
    let row = &page.rows[0];
    assert_eq!(row.classification, ReviewClassification::Review);
    assert_eq!(row.reason, ProposalReason::SharedIdentifier);
    assert_eq!(row.candidate_total, 201);
    assert_eq!(row.candidates.len(), 200);
    assert!(row.candidates_truncated);
    let next = review::get(
        &pool,
        &batch.id,
        &ReviewQuery {
            candidate_row_id: Some(row.row_id.clone()),
            candidate_offset: 200,
            candidate_limit: 200,
            proposal_revision: Some(page.proposal_revision.clone()),
            ..ReviewQuery::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(next.rows.len(), 1);
    assert_eq!(next.rows[0].classification, ReviewClassification::Review);
    assert_eq!(next.rows[0].proposal_revision, row.proposal_revision);
    assert_eq!(next.rows[0].candidates.len(), 1);
    let last = next.rows[0].candidates[0].entity_id.as_deref().unwrap();
    let mut tx = pool.begin().await.unwrap();
    let authorization = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&row.row_id)
        .unwrap();
    assert_eq!(authorization.candidate_ids().count(), 201);
    assert!(authorization.candidate_ids().any(|id| id == last));
    tx.commit().await.unwrap();
    let mut input = reviewed_input(&pool, &batch.id, &row.row_id, "select-last-page").await;
    input.merge_entity_ids.push(last.to_owned());
    let receipt = contacts::imports::review_decision_service::decide(&pool, &batch.id, &input)
        .await
        .unwrap();
    assert!(receipt.operation_id.is_some());
    assert_eq!(receipt.pending_entity_ids.len(), 200);
    let group = contacts::merges::repo::group(&pool, receipt.entity_id.as_deref().unwrap())
        .await
        .unwrap();
    assert!(group.member_ids.iter().any(|id| id == last));
}

#[tokio::test]
async fn hidden_incoming_rows_participate_before_row_pagination() {
    let (pool, account) = setup().await;
    let mut rows: Vec<_> = (0..51)
        .map(|index| {
            incoming(
                &format!("row-{index}"),
                &format!("Fictional {index}"),
                &format!("unique-{index}@example.test"),
            )
        })
        .collect();
    rows[50] = incoming("last", "Collision", "unique-0@example.test");
    let batch = stage(&pool, &account, rows).await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(page.total_rows, 51);
    assert_eq!(page.rows.len(), 50);
    assert_eq!(page.counts.review, 2);
    assert_eq!(page.counts.new, 49);
    let first = &page.rows[0];
    assert_eq!(first.classification, ReviewClassification::Review);
    assert_eq!(first.reason, ProposalReason::BatchMatch);
    assert_eq!(first.candidates[0].entity_id, None);
    assert_eq!(
        first.candidates[0].row_id.as_deref(),
        Some(batch.rows[50].id.as_str())
    );
    assert!(first.candidates[0].points[0].id.is_none());
    let mut tx = pool.begin().await.unwrap();
    let auth = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&first.row_id)
        .unwrap();
    assert_eq!(auth.candidate_ids().count(), 0);
    assert_eq!(auth.pending_row_ids, vec![batch.rows[50].id.clone()]);
}

#[tokio::test]
async fn page_proofs_reject_directory_changes_and_invalid_bounds() {
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("one", "Incoming", "one@example.test")],
    )
    .await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let candidate_page = ReviewQuery {
        candidate_row_id: Some(batch.rows[0].id.clone()),
        proposal_revision: Some(page.proposal_revision),
        ..ReviewQuery::default()
    };
    person(&pool, "New directory person", "one@example.test").await;
    assert!(matches!(
        review::get(&pool, &batch.id, &candidate_page).await,
        Err(ImportError::Conflict(_))
    ));
    for query in [
        ReviewQuery {
            limit: 51,
            ..ReviewQuery::default()
        },
        ReviewQuery {
            candidate_limit: 201,
            ..ReviewQuery::default()
        },
        ReviewQuery {
            candidate_row_id: Some(batch.rows[0].id.clone()),
            ..ReviewQuery::default()
        },
    ] {
        assert!(matches!(
            review::get(&pool, &batch.id, &query).await,
            Err(ImportError::Invalid(_))
        ));
    }
}

async fn ingest(
    pool: &SqlitePool,
    batch: &contacts::imports::model::ImportBatch,
    index: usize,
) -> String {
    use contacts::imports::model::{CommitBatchInput, RowAction, RowDecision};
    service::commit(
        pool,
        &batch.id,
        &CommitBatchInput {
            revision: batch.revision,
            idempotency_key: format!("ingest-{index}"),
            decisions: vec![RowDecision {
                row_id: batch.rows[index].id.clone(),
                action: RowAction::CreatePerson,
            }],
        },
    )
    .await
    .unwrap()
    .rows[0]
        .entity_id
        .clone()
        .unwrap()
}

async fn merge(pool: &SqlitePool, canonical: &str, other: &str) {
    let mut conn = pool.acquire().await.unwrap();
    let revision = contacts::merges::repo::revision(&mut conn).await.unwrap();
    drop(conn);
    contacts::merges::service::merge(
        pool,
        contacts::merges::model::MergeBody {
            canonical_id: canonical.into(),
            member_ids: vec![other.into()],
            expected_revision: revision,
            idempotency_key: format!("merge-{other}"),
            evidence: "Fictional explicit identity decision".into(),
            selections: vec![],
            preferred_point_ids: vec![],
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn historical_member_separations_block_real_canonical_candidates() {
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("owner", "Incoming owner", "kept@example.test")],
    )
    .await;
    let owner = ingest(&pool, &batch, 0).await;
    let owner_root = person(
        &pool,
        "Owner canonical root",
        "unrelated-owner@example.test",
    )
    .await;
    merge(&pool, &owner_root, &owner).await;
    let target_root = person(
        &pool,
        "Target canonical root",
        "unrelated-target@example.test",
    )
    .await;
    let target_member = person(&pool, "Target historical owner", "kept@example.test").await;
    merge(&pool, &target_root, &target_member).await;
    let (left, right) = if owner < target_member {
        (&owner, &target_member)
    } else {
        (&target_member, &owner)
    };
    sqlx::query("INSERT INTO keep_separate(left_id,right_id) VALUES(?1,?2)")
        .bind(left)
        .bind(right)
        .execute(&pool)
        .await
        .unwrap();
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let row = &page.rows[0];
    assert_eq!(row.owner_entity_id.as_deref(), Some(owner.as_str()));
    assert_eq!(row.entity_id.as_deref(), Some(owner_root.as_str()));
    assert_eq!(row.reason, ProposalReason::KeepSeparate);
    assert_eq!(row.classification, ReviewClassification::Review);
    assert_eq!(row.candidate_total, 1);
    let target = &row.candidates[0];
    assert_eq!(target.entity_id.as_deref(), Some(target_root.as_str()));
    assert!(target.member_ids.contains(&target_member));
    assert!(target.keep_separate);
    assert!(target
        .points
        .iter()
        .any(|point| point.owner_entity_id.as_deref() == Some(target_member.as_str())));
    let mut tx = pool.begin().await.unwrap();
    let auth = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&row.row_id)
        .unwrap();
    assert_eq!(auth.blocked_entity_ids, vec![target_root]);
}

#[tokio::test]
async fn selected_inactive_points_match_but_unselected_history_is_hidden() {
    let (pool, account) = setup().await;
    let owner = person(&pool, "Fictional source owner", "local@example.test").await;
    let input = contacts::sources::model::SourceRecordInput {
        account_id: account.clone(),
        collection_key: "older-source".into(),
        record_key: "owner".into(),
        entity_id: owner.clone(),
        display_name: Some("Source owner".into()),
        name: PersonName::default(),
        points: vec![
            point("retained@example.test"),
            point("removed@example.test"),
        ],
    };
    let mut tx = pool.begin().await.unwrap();
    let source = sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &owner).await.unwrap();
    let retained = points
        .iter()
        .find(|point| point.value == "retained@example.test")
        .unwrap();
    persons::prefer_point(&pool, &owner, &retained.id)
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    sources::deactivate_record(&mut tx, &source.id)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let batch = stage(
        &pool,
        &account,
        vec![
            incoming("retained", "Incoming retained", "retained@example.test"),
            incoming("removed", "Incoming removed", "removed@example.test"),
        ],
    )
    .await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(page.rows[0].classification, ReviewClassification::Automatic);
    assert_eq!(page.rows[0].reason, ProposalReason::Email);
    assert_eq!(page.rows[1].classification, ReviewClassification::New);
    let candidate = &page.rows[0].candidates[0];
    assert!(candidate
        .points
        .iter()
        .any(|point| point.value == "retained@example.test" && point.preferred && !point.active));
    assert!(!candidate
        .points
        .iter()
        .any(|point| point.value == "removed@example.test"));
    assert_eq!(
        candidate.sources[0].owner_entity_id.as_deref(),
        Some(owner.as_str())
    );
    assert!(!candidate.sources[0].active);
}

#[tokio::test]
async fn durable_binding_revisions_and_missing_owners_are_stale() {
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("stale", "Fictional owner", "old@example.test")],
    )
    .await;
    let owner = ingest(&pool, &batch, 0).await;
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(
        &mut tx,
        &contacts::sources::model::SourceRecordInput {
            account_id: account,
            collection_key: "fixture".into(),
            record_key: "stale".into(),
            entity_id: owner,
            display_name: Some("Changed observation".into()),
            name: PersonName::default(),
            points: vec![point("new@example.test")],
        },
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert!(page.rows[0].stale_source);
    assert_eq!(page.rows[0].classification, ReviewClassification::Review);
    assert_eq!(page.rows[0].reason, ProposalReason::StaleSource);
    sqlx::query("UPDATE contact_import_review_states SET entity_id='missing-owner',source_record_id='missing-source' WHERE row_id=?1").bind(&batch.rows[0].id).execute(&pool).await.unwrap();
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert!(page.rows[0].stale_source);
    assert!(page.rows[0].entity_id.is_none());
}

#[tokio::test]
async fn decision_only_changes_invalidate_proof_without_directory_revision_change() {
    use contacts::imports::review_state::{self, CandidateDecision};
    use std::collections::BTreeMap;
    let (pool, account) = setup().await;
    let target = person(&pool, "Fictional target", "same@example.test").await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("one", "Incoming", "same@example.test")],
    )
    .await;
    let before = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    review_state::save_decisions(
        &mut tx,
        &batch.rows[0].id,
        &BTreeMap::from([(target.clone(), CandidateDecision::Later)]),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let after = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(before.directory_revision, after.directory_revision);
    assert_ne!(before.proposal_revision, after.proposal_revision);
    assert_ne!(
        before.rows[0].proposal_revision,
        after.rows[0].proposal_revision
    );
    assert_eq!(
        after.rows[0].decisions.get(&target),
        Some(&CandidateDecision::Later)
    );
    assert!(matches!(
        review::get(
            &pool,
            &batch.id,
            &ReviewQuery {
                proposal_revision: Some(before.proposal_revision),
                ..ReviewQuery::default()
            }
        )
        .await,
        Err(ImportError::Conflict(_))
    ));
}

fn complete_name(given: &str, family: &str) -> PersonName {
    PersonName {
        given_name: Some(given.into()),
        family_name: Some(family.into()),
        completeness: contacts::persons::model::NameCompleteness::Complete,
        ..PersonName::default()
    }
}

#[tokio::test]
async fn complete_name_homonyms_and_display_only_names_never_become_unique_matches() {
    let (pool, account) = setup().await;
    let first = person(&pool, "One fictional person", "first@example.test").await;
    let second = person(&pool, "Two fictional people", "second@example.test").await;
    for id in [&first, &second] {
        persons::put_profile(&pool, id, complete_name("Amélie", "Martin"))
            .await
            .unwrap();
    }
    let structured = StageRowInput {
        record_key: "structured".into(),
        removed: false,
        errors: vec![],
        payload: Some(ImportPayload {
            display_name: Some("Amélie Martin".into()),
            name: complete_name("Ame\u{301}lie", "Martin"),
            points: vec![],
        }),
    };
    let batch = stage(&pool, &account, vec![structured]).await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(page.rows[0].reason, ProposalReason::AmbiguousName);
    assert_eq!(page.rows[0].classification, ReviewClassification::Review);
    assert_eq!(page.rows[0].candidate_total, 2);
    let display = StageRowInput {
        record_key: "display".into(),
        removed: false,
        errors: vec![],
        payload: Some(ImportPayload {
            display_name: Some("Amélie Martin".into()),
            name: PersonName::default(),
            points: vec![],
        }),
    };
    let batch = stage(&pool, &account, vec![display]).await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(page.rows[0].reason, ProposalReason::IncompleteName);
    assert_eq!(page.rows[0].classification, ReviewClassification::Review);
}

#[tokio::test]
async fn selected_source_name_uses_frozen_profile_and_exposes_raw_local_choice() {
    use contacts::merges::model::{FieldSelection, MergeBody, SourceMergeField};
    let (pool, account) = setup().await;
    let root = person(&pool, "Original root local name", "root@example.test").await;
    let owner = person(&pool, "Original source owner name", "owner@example.test").await;
    let mut source_input = contacts::sources::model::SourceRecordInput {
        account_id: account.clone(),
        collection_key: "old-observation".into(),
        record_key: "owner".into(),
        entity_id: owner.clone(),
        display_name: Some("Amélie Martin".into()),
        name: complete_name("Amélie", "Martin"),
        points: vec![],
    };
    let mut tx = pool.begin().await.unwrap();
    let source = sources::apply_record(&mut tx, &source_input).await.unwrap();
    let revision = contacts::merges::repo::revision(&mut tx).await.unwrap();
    tx.commit().await.unwrap();
    contacts::merges::service::merge(
        &pool,
        MergeBody {
            canonical_id: root.clone(),
            member_ids: vec![owner.clone()],
            expected_revision: revision,
            idempotency_key: "select-source-name".into(),
            evidence: "Explicit fictional name choice".into(),
            selections: vec![
                FieldSelection::SourceRecord {
                    field: SourceMergeField::Name,
                    source_record_id: source.id.clone(),
                },
                FieldSelection::SourceRecord {
                    field: SourceMergeField::PersonProfile,
                    source_record_id: source.id.clone(),
                },
            ],
            preferred_point_ids: vec![],
        },
    )
    .await
    .unwrap();
    source_input.display_name = Some("Changed upstream name".into());
    source_input.name = complete_name("Changed", "Upstream");
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(&mut tx, &source_input).await.unwrap();
    tx.commit().await.unwrap();
    let batch = stage(
        &pool,
        &account,
        vec![StageRowInput {
            record_key: "new-observation".into(),
            removed: false,
            errors: vec![],
            payload: Some(ImportPayload {
                display_name: Some("Amélie Martin".into()),
                name: complete_name("Amélie", "Martin"),
                points: vec![],
            }),
        }],
    )
    .await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert_eq!(page.rows[0].reason, ProposalReason::CompleteName);
    assert_eq!(page.rows[0].classification, ReviewClassification::Automatic);
    let candidate = &page.rows[0].candidates[0];
    assert_eq!(candidate.entity_id.as_deref(), Some(root.as_str()));
    assert_eq!(candidate.name, "Amélie Martin");
    assert_eq!(candidate.local_name, "Original root local name");
    let profile = candidate.person_profile.as_ref().unwrap();
    assert_eq!(profile.name.given_name.as_deref(), Some("Amélie"));
    assert!(profile.source_observation_id.is_some());
    assert_eq!(profile.entity_id, owner);
    assert_eq!(
        candidate.sources[0].name.given_name.as_deref(),
        Some("Changed")
    );
}

#[tokio::test]
async fn ingested_rows_remain_recognized_without_suggesting_their_own_group() {
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("ingested", "Fictional owner", "only@example.test")],
    )
    .await;
    let owner = ingest(&pool, &batch, 0).await;
    let page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let row = &page.rows[0];
    assert_eq!(row.entity_id.as_deref(), Some(owner.as_str()));
    assert_eq!(row.classification, ReviewClassification::Automatic);
    assert_eq!(row.reason, ProposalReason::SourceIdentity);
    assert_eq!(row.candidate_total, 0);
    assert!(!row.stale_source);
}

#[tokio::test]
async fn caller_transaction_keeps_directory_revision_and_evidence_in_one_wal_snapshot() {
    let tmp = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp");
    std::fs::create_dir_all(&tmp).unwrap();
    let directory = tmp.join(format!("review-snapshot-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let pool = db::connect(&format!(
        "sqlite:{}",
        directory.join("review.sqlite").display()
    ))
    .await
    .unwrap();
    let account = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "snapshot-fixture".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let batch = stage(
        &pool,
        &account.id,
        vec![incoming("snapshot", "Incoming", "new@example.test")],
    )
    .await;
    let mut tx = pool.begin().await.unwrap();
    let before = review::snapshot(&mut tx, &batch.id).await.unwrap();
    let id = person(&pool, "Concurrent fictional person", "new@example.test").await;
    let same = review::snapshot(&mut tx, &batch.id).await.unwrap();
    assert_eq!(before.directory_revision, same.directory_revision);
    assert_eq!(before.proposal_revision, same.proposal_revision);
    assert_eq!(
        same.authorize(&batch.rows[0].id)
            .unwrap()
            .candidate_ids()
            .count(),
        0
    );
    tx.commit().await.unwrap();
    let fresh = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert!(fresh.directory_revision > before.directory_revision);
    assert_eq!(
        fresh.rows[0].candidates[0].entity_id.as_deref(),
        Some(id.as_str())
    );
    pool.close().await;
    std::fs::remove_dir_all(directory).unwrap();
}

#[tokio::test]
async fn review_route_rejects_invalid_queries_and_exposes_the_registered_read() {
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![incoming("route", "Incoming", "one@example.test")],
    )
    .await;
    let app = contacts::app::build_router(contacts::app::AppState {
        pool,
        version: "test".into(),
        service_account_scope_verifier:
            contacts::service_account_scope::ServiceAccountScopeVerifier::new("http://127.0.0.1:1")
                .unwrap(),
    });
    let base = format!("/imports/{}/review-proposals", batch.id);
    for (query, expected) in [
        ("", StatusCode::OK),
        ("?limit=0", StatusCode::BAD_REQUEST),
        ("?candidateLimit=201", StatusCode::BAD_REQUEST),
        ("?offset=1", StatusCode::BAD_REQUEST),
        ("?candidateOffset=1", StatusCode::BAD_REQUEST),
        ("?unknown=true", StatusCode::BAD_REQUEST),
        ("?limit=-1", StatusCode::BAD_REQUEST),
        ("?proposalRevision=stale", StatusCode::CONFLICT),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("{base}{query}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{query}");
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap())
                .unwrap();
        if expected == StatusCode::OK {
            assert_eq!(body["totalRows"], 1);
            assert_eq!(body["rows"][0]["classification"], "new");
        } else {
            assert!(body["message"]
                .as_str()
                .is_some_and(|message| !message.is_empty()));
            assert!(body.get("requestId").is_some());
        }
    }
}

async fn reviewed_input(
    pool: &SqlitePool,
    batch_id: &str,
    row_id: &str,
    key: &str,
) -> contacts::imports::review_decision_model::ReviewDecisionInput {
    let mut tx = pool.begin().await.unwrap();
    let auth = review::snapshot(&mut tx, batch_id)
        .await
        .unwrap()
        .authorize(row_id)
        .unwrap();
    tx.commit().await.unwrap();
    contacts::imports::review_decision_model::ReviewDecisionInput {
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

#[tokio::test]
async fn batch_only_collision_can_ingest_then_refresh_then_explicitly_merge_real_people() {
    use contacts::imports::review_decision_service::decide;
    let (pool, account) = setup().await;
    let batch = stage(
        &pool,
        &account,
        vec![
            incoming(
                "first",
                "First fictional observation",
                "collision@example.test",
            ),
            incoming(
                "second",
                "Second fictional observation",
                "collision@example.test",
            ),
        ],
    )
    .await;
    let initial = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert!(initial
        .rows
        .iter()
        .all(|row| row.classification == ReviewClassification::Review
            && row.candidate_total == 1
            && row.candidates[0].entity_id.is_none()
            && row.candidates[0].row_id.is_some()));
    let first_input = reviewed_input(&pool, &batch.id, &batch.rows[0].id, "ingest-first").await;
    let first = decide(&pool, &batch.id, &first_input).await.unwrap();
    assert!(!first.processed);
    let first_person = first.entity_id.as_deref().unwrap();
    let refreshed = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    let second = &refreshed.rows[1];
    assert_eq!(second.candidate_total, 1);
    assert_eq!(
        second.candidates[0].entity_id.as_deref(),
        Some(first_person)
    );
    assert!(second.candidates[0].row_id.is_none());
    let mut body = reviewed_input(&pool, &batch.id, &batch.rows[1].id, "merge-second").await;
    body.merge_entity_ids.push(first_person.to_owned());
    let merged = decide(&pool, &batch.id, &body).await.unwrap();
    assert!(merged.processed);
    assert!(merged.operation_id.is_some());
    let root = merged.entity_id.as_deref().unwrap();
    let group = contacts::merges::repo::group(&pool, root).await.unwrap();
    assert_eq!(group.member_ids.len(), 2);
    assert!(group.member_ids.iter().any(|id| id == first_person));
    let original_owners: Vec<String> =
        sqlx::query_scalar("SELECT entity_id FROM source_records ORDER BY record_key")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(original_owners.len(), 2);
    assert_eq!(original_owners[0], first_person);
    assert_ne!(original_owners[0], original_owners[1]);
    let replay = decide(&pool, &batch.id, &body).await.unwrap();
    assert_eq!(
        serde_json::to_value(&merged).unwrap(),
        serde_json::to_value(replay).unwrap()
    );
    let final_input = reviewed_input(&pool, &batch.id, &batch.rows[0].id, "finish-first").await;
    let finished = decide(&pool, &batch.id, &final_input).await.unwrap();
    assert!(finished.processed);
    let final_page = review::get(&pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    assert!(final_page.rows.iter().all(|row| row.processed
        && row.candidate_total == 0
        && row.entity_id.as_deref() == Some(root)));
}
