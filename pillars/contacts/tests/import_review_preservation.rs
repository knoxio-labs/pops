//! Existing preferred projections survive reviewed imports unless the request selects replacements.

use contacts::imports::model::{ImportBatch, ImportPayload, StageBatchInput, StageRowInput};
use contacts::imports::review_decision_model::ReviewDecisionInput;
use contacts::imports::{review, review_decision_service, service};
use contacts::persons::model::{ContactPointInput, ContactPointKind, NameCompleteness, PersonName};
use contacts::persons::repo as persons;
use contacts::sources::{model::SourceAccountInput, repo as sources};
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
#[tokio::test]
async fn manual_empty_selections_preserve_existing_preferred_values() {
    let (pool, account) = setup().await;
    let existing = person(
        &pool,
        "Existing chosen label",
        vec![email("manual@example.test")],
    )
    .await;
    persons::put_profile(&pool, &existing, name("Existing", "Chosen"))
        .await
        .unwrap();
    let preferred = persons::list_points(&pool, &existing)
        .await
        .unwrap()
        .remove(0);
    persons::prefer_point(&pool, &existing, &preferred.id)
        .await
        .unwrap();
    let batch = stage(
        &pool,
        &account,
        vec![row(
            "manual",
            "Incoming label",
            vec![email("manual@example.test")],
        )],
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
            idempotency_key: "manual-default".into(),
            merge_entity_ids: vec![existing.clone()],
            different_entity_ids: vec![],
            later_entity_ids: vec![],
            selections: vec![],
            preferred_point_ids: vec![],
        },
    )
    .await
    .unwrap();
    let actual_name = contacts::entities::repo::get(&pool, &existing)
        .await
        .unwrap()
        .unwrap()
        .name;
    let actual_profile = persons::get_profile(&pool, &existing)
        .await
        .unwrap()
        .and_then(|profile| profile.name.family_name);
    let actual_points: Vec<String> = persons::list_points(&pool, &existing)
        .await
        .unwrap()
        .into_iter()
        .filter(|point| point.preferred)
        .map(|point| point.id)
        .collect();
    assert_eq!(
        (actual_name, actual_profile, actual_points),
        (
            "Existing chosen label".into(),
            Some("Chosen".into()),
            vec![preferred.id]
        )
    );
}

async fn decision(pool: &SqlitePool, batch: &ImportBatch, key: &str) -> ReviewDecisionInput {
    let mut tx = pool.begin().await.unwrap();
    let authorization = review::snapshot(&mut tx, &batch.id)
        .await
        .unwrap()
        .authorize(&batch.rows[0].id)
        .unwrap();
    tx.commit().await.unwrap();
    ReviewDecisionInput {
        batch_revision: authorization.batch_revision,
        directory_revision: authorization.directory_revision,
        proposal_revision: authorization.proposal_revision,
        row_id: batch.rows[0].id.clone(),
        idempotency_key: key.into(),
        merge_entity_ids: vec![],
        different_entity_ids: vec![],
        later_entity_ids: vec![],
        selections: vec![],
        preferred_point_ids: vec![],
    }
}

#[tokio::test]
async fn first_merge_default_is_stable_for_multiple_selected_existing_targets() {
    let (pool, account) = setup().await;
    let a = person(&pool, "Existing A", vec![email("shared@example.test")]).await;
    let b = person(&pool, "Existing B", vec![email("shared@example.test")]).await;
    let batch = stage(
        &pool,
        &account,
        vec![row(
            "multiple",
            "Incoming",
            vec![email("shared@example.test")],
        )],
    )
    .await;
    let mut input = decision(&pool, &batch, "multiple").await;
    let mut targets = [a, b];
    targets.sort();
    input.merge_entity_ids = targets.iter().rev().cloned().collect();
    let result = review_decision_service::decide(&pool, &batch.id, &input)
        .await
        .unwrap();
    assert_eq!(result.entity_id.as_deref(), Some(targets[0].as_str()));
    let group = contacts::merges::repo::group(&pool, &targets[0])
        .await
        .unwrap();
    assert_eq!(group.member_ids.len(), 3);
}

#[tokio::test]
async fn later_subset_preserves_canonical_source_owner_negatives_and_explicit_incoming_replacements(
) {
    use contacts::merges::model::{FieldSelection, SourceMergeField};
    let (pool, account) = setup().await;
    let existing = person(
        &pool,
        "Existing preferred",
        vec![email("shared@example.test")],
    )
    .await;
    persons::put_profile(&pool, &existing, name("Existing", "Chosen"))
        .await
        .unwrap();
    let rejected = person(&pool, "Rejected", vec![email("shared@example.test")]).await;
    let later = person(&pool, "Later candidate", vec![email("shared@example.test")]).await;
    let later_point = persons::list_points(&pool, &later).await.unwrap().remove(0);
    let mut incoming = row(
        "partial",
        "Incoming label",
        vec![email("shared@example.test")],
    );
    incoming.payload.as_mut().unwrap().name = name("Incoming", "Imported");
    let batch = stage(&pool, &account, vec![incoming]).await;
    let mut first = decision(&pool, &batch, "first").await;
    first.merge_entity_ids = vec![existing.clone()];
    first.different_entity_ids = vec![rejected.clone()];
    first.later_entity_ids = vec![later.clone()];
    let first_result = review_decision_service::decide(&pool, &batch.id, &first)
        .await
        .unwrap();
    assert_eq!(first_result.entity_id.as_deref(), Some(existing.as_str()));
    assert!(!first_result.processed);
    assert_eq!(
        persons::get_profile(&pool, &existing)
            .await
            .unwrap()
            .unwrap()
            .name
            .family_name
            .as_deref(),
        Some("Chosen")
    );
    let state =
        contacts::imports::review_state::get(&mut pool.acquire().await.unwrap(), &batch.rows[0].id)
            .await
            .unwrap()
            .unwrap();
    let original_owner = state.entity_id.clone().unwrap();
    let source = state.source_record_id.clone().unwrap();
    assert_ne!(original_owner, existing);
    let history_owner:String=sqlx::query_scalar("SELECT json_extract(observation,'$.entityId') FROM source_record_history WHERE source_record_id=?1 ORDER BY rowid DESC LIMIT 1").bind(&source).fetch_one(&pool).await.unwrap();
    assert_eq!(history_owner, original_owner);
    let mut second = decision(&pool, &batch, "second").await;
    second.merge_entity_ids = vec![later.clone()];
    second.selections = vec![
        FieldSelection::SourceRecord {
            field: SourceMergeField::Name,
            source_record_id: source.clone(),
        },
        FieldSelection::SourceRecord {
            field: SourceMergeField::PersonProfile,
            source_record_id: source.clone(),
        },
    ];
    second.preferred_point_ids = vec![later_point.id.clone()];
    let result = review_decision_service::decide(&pool, &batch.id, &second)
        .await
        .unwrap();
    assert_eq!(result.entity_id.as_deref(), Some(existing.as_str()));
    assert!(result.processed);
    assert_eq!(
        contacts::entities::repo::get(&pool, &existing)
            .await
            .unwrap()
            .unwrap()
            .name,
        "Incoming label"
    );
    let profile = persons::get_profile(&pool, &existing)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(profile.name.family_name.as_deref(), Some("Imported"));
    assert_eq!(profile.source_record_id.as_deref(), Some(source.as_str()));
    assert!(persons::list_points(&pool, &existing)
        .await
        .unwrap()
        .iter()
        .any(|point| point.id == later_point.id && point.preferred));
    let after =
        contacts::imports::review_state::get(&mut pool.acquire().await.unwrap(), &batch.rows[0].id)
            .await
            .unwrap()
            .unwrap();
    assert_eq!(after.entity_id.as_deref(), Some(original_owner.as_str()));
    assert_eq!(after.source_record_id.as_deref(), Some(source.as_str()));
    let negatives = contacts::merges::repo::separate_pairs(&pool).await.unwrap();
    assert!(negatives
        .data
        .iter()
        .any(
            |pair| (pair.left_id == original_owner && pair.right_id == rejected)
                || (pair.right_id == original_owner && pair.left_id == rejected)
        ));
    assert!(negatives.data.iter().any(|pair| (pair.left_id == existing
        && pair.right_id == rejected)
        || (pair.right_id == existing && pair.left_id == rejected)));
}
