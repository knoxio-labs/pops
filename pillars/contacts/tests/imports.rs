//! Import transaction contracts exercised against the production migration journal.

use contacts::db;
use contacts::imports::file::parse_stage_input;
use contacts::imports::model::{
    CommitBatchInput, ImportPayload, RowAction, RowDecision, RowIssue, RowProposal,
    StageBatchInput, StageRowInput,
};
use contacts::imports::parser::{FileEncoding, FileFormat};
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
            account_key: "personal".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    (pool, account.id)
}

fn payload(name: &str) -> ImportPayload {
    ImportPayload {
        display_name: Some(name.into()),
        name: PersonName::default(),
        points: vec![ContactPointInput {
            kind: ContactPointKind::Email,
            country_code: None,
            value: "person@example.test".into(),
            label: None,
        }],
    }
}

fn row(key: &str, name: &str) -> StageRowInput {
    StageRowInput {
        record_key: key.into(),
        payload: Some(payload(name)),
        removed: false,
        errors: Vec::new(),
    }
}

fn input(account: &str, rows: Vec<StageRowInput>) -> StageBatchInput {
    StageBatchInput {
        account_id: account.into(),
        collection_key: "personal".into(),
        rows,
    }
}

fn commit(revision: i64, key: &str, rows: Vec<(&str, RowAction)>) -> CommitBatchInput {
    CommitBatchInput {
        revision,
        idempotency_key: key.into(),
        decisions: rows
            .into_iter()
            .map(|(id, action)| RowDecision {
                row_id: id.into(),
                action,
            })
            .collect(),
    }
}

async fn counts(pool: &SqlitePool) -> (i64, i64) {
    sqlx::query_as("SELECT (SELECT COUNT(*) FROM entities),(SELECT COUNT(*) FROM source_records)")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn staging_persists_duplicate_invalid_and_malformed_rows_without_directory_writes() {
    let (pool, account) = setup().await;
    let mut invalid = row("invalid", "Too long");
    invalid.payload.as_mut().unwrap().points[0].value = String::new();
    let batch = service::stage(
        &pool,
        &input(
            &account,
            vec![row("same", "First"), row("same", "Second"), invalid],
        ),
    )
    .await
    .unwrap();
    assert_eq!(counts(&pool).await, (0, 0));
    for row in &batch.rows[..2] {
        assert!(row.errors.contains(&RowIssue::DuplicateSourceKey));
        assert!(matches!(row.proposal, RowProposal::Invalid));
    }
    assert!(batch.rows[2].errors.contains(&RowIssue::InvalidRecord));
    let stored = service::get(&pool, &batch.id).await.unwrap();
    assert_eq!(
        serde_json::to_value(stored).unwrap(),
        serde_json::to_value(&batch).unwrap()
    );
    let invalid_commit = commit(
        1,
        "invalid",
        vec![(&batch.rows[0].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &invalid_commit).await,
        Err(ImportError::Invalid(_))
    ));
    let malformed = parse_stage_input(
        account.clone(),
        "personal".into(),
        b"BEGIN:VCARD\nVERSION:4.0\nFN:private data",
        FileFormat::Vcard,
        FileEncoding::Utf8,
    )
    .unwrap();
    let failed = service::stage(&pool, &malformed).await.unwrap();
    assert!(failed
        .rows
        .iter()
        .all(|row| row.errors.contains(&RowIssue::MalformedRecord)));
    assert_eq!(counts(&pool).await, (0, 0));
}

#[tokio::test]
async fn selected_commit_is_atomic_partial_and_exactly_retryable_before_revision_check() {
    let (pool, account) = setup().await;
    let batch = service::stage(
        &pool,
        &input(
            &account,
            vec![row("one", "Same Name"), row("two", "Same Name")],
        ),
    )
    .await
    .unwrap();
    let first = commit(
        1,
        "first",
        vec![(&batch.rows[0].id, RowAction::CreatePerson)],
    );
    let receipt = service::commit(&pool, &batch.id, &first).await.unwrap();
    assert_eq!(receipt.revision, 2);
    assert_eq!(counts(&pool).await, (1, 1));
    let replay = service::commit(&pool, &batch.id, &first).await.unwrap();
    assert_eq!(
        serde_json::to_value(replay).unwrap(),
        serde_json::to_value(receipt).unwrap()
    );
    assert_eq!(counts(&pool).await, (1, 1));
    let preview = service::get(&pool, &batch.id).await.unwrap();
    assert!(preview.rows[0].processed);
    assert!(!preview.rows[1].processed);
    let stale = commit(
        1,
        "second",
        vec![(&batch.rows[1].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &stale).await,
        Err(ImportError::Conflict(_))
    ));
    let reused = commit(
        2,
        "first",
        vec![(&batch.rows[1].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &reused).await,
        Err(ImportError::Conflict(_))
    ));
    let second = commit(
        2,
        "second",
        vec![(&batch.rows[1].id, RowAction::CreatePerson)],
    );
    service::commit(&pool, &batch.id, &second).await.unwrap();
    assert_eq!(counts(&pool).await, (2, 2));
    let processed = commit(
        3,
        "processed",
        vec![(&batch.rows[0].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &processed).await,
        Err(ImportError::Conflict(_))
    ));
}

#[tokio::test]
async fn a_failed_late_write_rolls_back_people_sources_rows_revisions_and_receipts() {
    let (pool, account) = setup().await;
    let batch = service::stage(
        &pool,
        &input(&account, vec![row("one", "First"), row("two", "Second")]),
    )
    .await
    .unwrap();
    sqlx::query("CREATE TRIGGER fail_second_import BEFORE INSERT ON source_records WHEN NEW.record_key='two' BEGIN SELECT RAISE(ABORT,'private database context'); END").execute(&pool).await.unwrap();
    let request = commit(
        1,
        "atomic",
        vec![
            (&batch.rows[0].id, RowAction::CreatePerson),
            (&batch.rows[1].id, RowAction::CreatePerson),
        ],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &request).await,
        Err(ImportError::Storage)
    ));
    assert_eq!(counts(&pool).await, (0, 0));
    let stored = service::get(&pool, &batch.id).await.unwrap();
    assert_eq!(stored.revision, 1);
    assert!(stored.rows.iter().all(|row| !row.processed));
    let receipts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contact_import_receipts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(receipts, 0);
    sqlx::query("DROP TRIGGER fail_second_import")
        .execute(&pool)
        .await
        .unwrap();
    service::commit(&pool, &batch.id, &request).await.unwrap();
    assert_eq!(counts(&pool).await, (2, 2));
}

#[tokio::test]
async fn source_identity_updates_preserve_local_values_and_reject_stale_source_previews() {
    let (pool, account) = setup().await;
    let initial = service::stage(
        &pool,
        &input(&account, vec![row("stable", "Original Name")]),
    )
    .await
    .unwrap();
    let receipt = service::commit(
        &pool,
        &initial.id,
        &commit(
            1,
            "initial",
            vec![(&initial.rows[0].id, RowAction::CreatePerson)],
        ),
    )
    .await
    .unwrap();
    let entity = receipt.rows[0].entity_id.as_ref().unwrap();
    let mut conn = pool.acquire().await.unwrap();
    let local = persons::insert_point(
        &mut conn,
        entity,
        &ContactPointInput {
            kind: ContactPointKind::Phone,
            country_code: None,
            value: "+61412345678".into(),
            label: Some("local".into()),
        },
        None,
    )
    .await
    .unwrap();
    drop(conn);
    persons::prefer_point(&pool, entity, &local.id)
        .await
        .unwrap();
    sqlx::query("UPDATE entities SET name='Locally Edited' WHERE id=?1")
        .bind(entity)
        .execute(&pool)
        .await
        .unwrap();
    let update = service::stage(
        &pool,
        &input(&account, vec![row("stable", "Provider Changed")]),
    )
    .await
    .unwrap();
    assert!(matches!(update.rows[0].proposal, RowProposal::UpdateSource));
    let create = commit(
        1,
        "wrong-action",
        vec![(&update.rows[0].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &update.id, &create).await,
        Err(ImportError::Invalid(_))
    ));
    let second_preview = service::stage(
        &pool,
        &input(&account, vec![row("stable", "Older Preview")]),
    )
    .await
    .unwrap();
    service::commit(
        &pool,
        &update.id,
        &commit(
            1,
            "update",
            vec![(&update.rows[0].id, RowAction::UpdateSource)],
        ),
    )
    .await
    .unwrap();
    assert_eq!(counts(&pool).await, (1, 1));
    let name: String = sqlx::query_scalar("SELECT name FROM entities WHERE id=?1")
        .bind(entity)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Locally Edited");
    let points = persons::list_points(&pool, entity).await.unwrap();
    assert!(points.iter().any(|point| point.id == local.id
        && point.preferred
        && point.active
        && point.source_record_id.is_none()));
    let stale = commit(
        1,
        "stale-source",
        vec![(&second_preview.rows[0].id, RowAction::UpdateSource)],
    );
    assert!(matches!(
        service::commit(&pool, &second_preview.id, &stale).await,
        Err(ImportError::Conflict(_))
    ));
}

#[tokio::test]
async fn removals_only_deactivate_the_known_source_and_linking_requires_explicit_person_target() {
    let (pool, account) = setup().await;
    let mut conn = pool.acquire().await.unwrap();
    let entity = persons::create_person(&mut conn, "Existing").await.unwrap();
    drop(conn);
    let batch = service::stage(
        &pool,
        &input(&account, vec![row("external", "Different Name")]),
    )
    .await
    .unwrap();
    let request = commit(
        1,
        "link",
        vec![(
            &batch.rows[0].id,
            RowAction::LinkPerson {
                entity_id: entity.clone(),
            },
        )],
    );
    service::commit(&pool, &batch.id, &request).await.unwrap();
    let removed = StageRowInput {
        record_key: "external".into(),
        payload: None,
        removed: true,
        errors: Vec::new(),
    };
    let batch = service::stage(&pool, &input(&account, vec![removed]))
        .await
        .unwrap();
    assert!(matches!(
        batch.rows[0].proposal,
        RowProposal::DeactivateSource
    ));
    service::commit(
        &pool,
        &batch.id,
        &commit(
            1,
            "remove",
            vec![(&batch.rows[0].id, RowAction::DeactivateSource)],
        ),
    )
    .await
    .unwrap();
    assert_eq!(counts(&pool).await, (1, 1));
    let records = sources::list_records(&pool, &entity).await.unwrap();
    assert!(!records[0].active);
    assert!(persons::list_points(&pool, &entity)
        .await
        .unwrap()
        .iter()
        .all(|point| !point.active));
}

#[tokio::test]
async fn file_replay_uses_uid_or_exact_file_and_ordinal_without_name_identity() {
    let (pool, account) = setup().await;
    let bytes =
        b"BEGIN:VCARD\nVERSION:4.0\nFN:Jo\nEND:VCARD\nBEGIN:VCARD\nVERSION:4.0\nFN:Jo\nEND:VCARD\n";
    let parsed = parse_stage_input(
        account.clone(),
        "personal".into(),
        bytes,
        FileFormat::Vcard,
        FileEncoding::Utf8,
    )
    .unwrap();
    assert_ne!(parsed.rows[0].record_key, parsed.rows[1].record_key);
    let batch = service::stage(&pool, &parsed).await.unwrap();
    service::commit(
        &pool,
        &batch.id,
        &commit(
            1,
            "both",
            batch
                .rows
                .iter()
                .map(|row| (row.id.as_str(), RowAction::CreatePerson))
                .collect(),
        ),
    )
    .await
    .unwrap();
    let replay = service::stage(&pool, &parsed).await.unwrap();
    assert!(replay
        .rows
        .iter()
        .all(|row| matches!(row.proposal, RowProposal::UpdateSource)));
    service::commit(
        &pool,
        &replay.id,
        &commit(
            1,
            "replay",
            replay
                .rows
                .iter()
                .map(|row| (row.id.as_str(), RowAction::UpdateSource))
                .collect(),
        ),
    )
    .await
    .unwrap();
    assert_eq!(counts(&pool).await, (2, 2));
    let changed = parse_stage_input(
        account,
        "personal".into(),
        b"BEGIN:VCARD\nVERSION:4.0\nFN:Jo\nEND:VCARD\n",
        FileFormat::Vcard,
        FileEncoding::Utf8,
    )
    .unwrap();
    assert_ne!(changed.rows[0].record_key, parsed.rows[0].record_key);
}

#[tokio::test]
async fn invalid_selection_and_empty_limits_leave_all_rows_pending() {
    let (pool, account) = setup().await;
    assert!(matches!(
        service::stage(
            &pool,
            &input(&account, vec![row("limit", "Limit"); service::MAX_ROWS + 1])
        )
        .await,
        Err(ImportError::Invalid(_))
    ));
    assert!(matches!(
        service::stage(&pool, &input("unknown", vec![row("one", "One")])).await,
        Err(ImportError::NotFound)
    ));
    let batch = service::stage(&pool, &input(&account, vec![row("one", "One")]))
        .await
        .unwrap();
    let duplicate = commit(
        1,
        "duplicate",
        vec![
            (&batch.rows[0].id, RowAction::CreatePerson),
            (&batch.rows[0].id, RowAction::Skip),
        ],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &duplicate).await,
        Err(ImportError::Invalid(_))
    ));
    let unknown = commit(
        1,
        "unknown",
        vec![
            (&batch.rows[0].id, RowAction::CreatePerson),
            ("unknown", RowAction::CreatePerson),
        ],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &unknown).await,
        Err(ImportError::Invalid(_))
    ));
    assert_eq!(counts(&pool).await, (0, 0));
    assert_eq!(service::get(&pool, &batch.id).await.unwrap().revision, 1);
}

#[tokio::test]
async fn invalid_unselected_rows_do_not_block_an_explicit_valid_subset() {
    let (pool, account) = setup().await;
    let invalid = StageRowInput {
        record_key: "malformed".into(),
        payload: None,
        removed: false,
        errors: vec![RowIssue::MalformedRecord],
    };
    let batch = service::stage(
        &pool,
        &input(&account, vec![row("valid", "Person"), invalid]),
    )
    .await
    .unwrap();
    service::commit(
        &pool,
        &batch.id,
        &commit(
            1,
            "valid-only",
            vec![(&batch.rows[0].id, RowAction::CreatePerson)],
        ),
    )
    .await
    .unwrap();
    let preview = service::get(&pool, &batch.id).await.unwrap();
    assert!(preview.rows[0].processed);
    assert!(!preview.rows[1].processed);
    assert!(preview.rows[1].errors.contains(&RowIssue::MalformedRecord));
    assert_eq!(counts(&pool).await, (1, 1));
}

#[test]
fn commit_wire_schema_accepts_explicit_actions_and_rejects_extra_fields() {
    let body = serde_json::json!({"revision":1,"idempotencyKey":"safe","decisions":[{"rowId":"row","decision":{"action":"link_person","entityId":"person"}}]});
    let parsed: CommitBatchInput = serde_json::from_value(body).unwrap();
    assert!(matches!(
        parsed.decisions[0].action,
        RowAction::LinkPerson { .. }
    ));
    let body = serde_json::json!({"revision":1,"idempotencyKey":"safe","decisions":[{"rowId":"row","decision":{"action":"create_person"},"extra":"private"}]});
    assert!(serde_json::from_value::<CommitBatchInput>(body).is_err());
}

#[tokio::test]
async fn provider_previews_are_fenced_across_disconnect_and_reconnect() {
    let (pool, account) = setup().await;
    let unbound = service::stage(&pool, &input(&account, vec![row("before-provider", "One")]))
        .await
        .unwrap();
    sqlx::query("INSERT INTO provider_accounts(account_id,provider,owner_subject,epoch,connected,credential) VALUES(?1,'google','test-human',1,1,X'00')").bind(&account).execute(&pool).await.unwrap();
    let batch = service::stage(&pool, &input(&account, vec![row("one", "One")]))
        .await
        .unwrap();
    assert_eq!(batch.source_epoch, Some(1));
    sqlx::query(
        "UPDATE provider_accounts SET connected=0,credential=NULL,epoch=2 WHERE account_id=?1",
    )
    .bind(&account)
    .execute(&pool)
    .await
    .unwrap();
    let unbound_request = commit(
        1,
        "before-provider",
        vec![(&unbound.rows[0].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &unbound.id, &unbound_request).await,
        Err(ImportError::Conflict(_))
    ));
    let request = commit(
        1,
        "commit",
        vec![(&batch.rows[0].id, RowAction::CreatePerson)],
    );
    assert!(matches!(
        service::commit(&pool, &batch.id, &request).await,
        Err(ImportError::Conflict(_))
    ));
    assert!(matches!(
        service::stage(&pool, &input(&account, vec![row("two", "Two")])).await,
        Err(ImportError::Conflict(_))
    ));
    sqlx::query(
        "UPDATE provider_accounts SET connected=1,credential=X'00',epoch=3 WHERE account_id=?1",
    )
    .bind(&account)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        service::commit(&pool, &batch.id, &request).await,
        Err(ImportError::Conflict(_))
    ));
    assert_eq!(counts(&pool).await, (0, 0));
    let fresh = service::stage(&pool, &input(&account, Vec::new()))
        .await
        .unwrap();
    assert_eq!(fresh.source_epoch, Some(3));
    assert!(fresh.rows.is_empty());
}

#[tokio::test]
async fn previews_and_receipts_survive_reopening_and_concurrent_exact_retries() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let directory = root.join("tmp");
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join(format!("contacts-import-{}.db", uuid::Uuid::new_v4()));
    let url = format!("sqlite://{}", path.display());
    let pool = db::connect(&url).await.unwrap();
    let account = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "durable".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let batch = service::stage(&pool, &input(&account.id, vec![row("one", "One")]))
        .await
        .unwrap();
    pool.close().await;
    let pool = db::connect(&url).await.unwrap();
    assert_eq!(service::get(&pool, &batch.id).await.unwrap().revision, 1);
    let request = commit(
        1,
        "concurrent",
        vec![(&batch.rows[0].id, RowAction::CreatePerson)],
    );
    let (first, second) = tokio::join!(
        service::commit(&pool, &batch.id, &request),
        service::commit(&pool, &batch.id, &request)
    );
    assert_eq!(
        serde_json::to_value(first.unwrap()).unwrap(),
        serde_json::to_value(second.unwrap()).unwrap()
    );
    assert_eq!(counts(&pool).await, (1, 1));
    pool.close().await;
    let pool = db::connect(&url).await.unwrap();
    assert_eq!(
        service::commit(&pool, &batch.id, &request)
            .await
            .unwrap()
            .revision,
        2
    );
    assert_eq!(counts(&pool).await, (1, 1));
    pool.close().await;
    std::fs::remove_file(path).unwrap();
}

#[test]
fn retired_person_error_becomes_a_safe_import_conflict() {
    use contacts::imports::service::ImportError;
    use contacts::persons::repo::PersonError;

    assert!(matches!(
        ImportError::from(PersonError::Retired("fictional-canonical-id".to_string())),
        ImportError::Conflict("Identity changed; stage a new preview")
    ));
}
