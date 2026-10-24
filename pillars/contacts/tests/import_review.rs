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
