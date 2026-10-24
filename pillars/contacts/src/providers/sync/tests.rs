use super::*;
use crate::imports::model::{
    CommitBatchInput, ImportBatch, ImportPayload, RowAction, RowDecision, StageRowInput,
};
use crate::imports::service::{commit, ImportError};
use crate::persons::model::PersonName;
use crate::providers::credentials::{CredentialCipher, SecretBytes};
use crate::providers::human_auth::HumanIdentity;
use crate::providers::store::{
    disconnect_account, install_credential, prepare_account, AccountEpoch,
};
use crate::sources::model::SourceAccountInput;
use sqlx::SqlitePool;

async fn setup() -> (SqlitePool, String, AccountEpoch) {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let (id, epoch) = account(&pool).await;
    (pool, id, epoch)
}
async fn account(pool: &SqlitePool) -> (String, AccountEpoch) {
    let id = crate::sources::repo::create_or_get_account(
        pool,
        &SourceAccountInput {
            provider: "google".to_string(),
            account_key: "synthetic-provider".to_string(),
            label: None,
        },
    )
    .await
    .unwrap()
    .id;
    let operator = HumanIdentity::for_test("synthetic-operator");
    let epoch = prepare_account(pool, &operator, &id).await.unwrap();
    let epoch = install_credential(
        pool,
        &CredentialCipher::for_test(),
        &operator,
        &id,
        epoch,
        &SecretBytes::new(vec![42; 25]).unwrap(),
    )
    .await
    .unwrap();
    (id, epoch)
}
fn plan(key: &str, full_snapshot: bool) -> CollectionPlan {
    CollectionPlan {
        key: key.to_string(),
        full_snapshot,
    }
}
fn change(key: &str, name: &str) -> ProviderChange {
    ProviderChange {
        row: StageRowInput {
            record_key: key.to_string(),
            payload: Some(ImportPayload {
                display_name: Some(name.to_string()),
                name: PersonName::default(),
                points: Vec::new(),
            }),
            removed: false,
            errors: Vec::new(),
        },
        etag: Some(format!("etag-{name}")),
        uid: Some(format!("uid-{key}")),
    }
}
fn page(changes: Vec<ProviderChange>, progress: PageProgress) -> ProviderPage {
    ProviderPage {
        seen_record_keys: changes
            .iter()
            .filter(|change| !change.row.removed)
            .map(|change| change.row.record_key.clone())
            .collect(),
        changes,
        progress,
    }
}
fn done(checkpoint: &str) -> PageProgress {
    PageProgress::Complete {
        checkpoint: Some(checkpoint.to_string()),
    }
}
fn create(batch: &ImportBatch) -> CommitBatchInput {
    CommitBatchInput {
        revision: batch.revision,
        idempotency_key: uuid::Uuid::new_v4().to_string(),
        decisions: batch
            .rows
            .iter()
            .map(|row| RowDecision {
                row_id: row.id.clone(),
                action: RowAction::CreatePerson,
            })
            .collect(),
    }
}

#[tokio::test]
async fn a_page_failure_leaves_cache_checkpoint_and_directory_unchanged() {
    let (pool, id, epoch) = setup().await;
    let first = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &first.id,
        "book",
        None,
        &page(vec![change("one", "Original")], done("original")),
    )
    .await
    .unwrap();
    let batches = finalize_sync(&pool, &first.id).await.unwrap();
    commit(&pool, &batches[0].id, &create(&batches[0]))
        .await
        .unwrap();
    let next = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &next.id,
        "book",
        None,
        &page(
            vec![change("one", "Changed")],
            PageProgress::Continue {
                cursor: "second".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    assert!(matches!(
        finalize_sync(&pool, &next.id).await,
        Err(SyncError::Conflict)
    ));
    abort_sync(&pool, &next.id, SyncError::InvalidPage)
        .await
        .unwrap();
    assert_eq!(
        checkpoint(&pool, &id, "book").await.unwrap().as_deref(),
        Some("original")
    );
    let name: String = sqlx::query_scalar("SELECT name FROM entities WHERE type='person'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Original");
    assert_eq!(
        known_etags(&pool, &id, "book").await.unwrap()["one"],
        "etag-Original"
    );
}

#[tokio::test]
async fn every_collection_completes_before_any_checkpoint_or_preview_becomes_live() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("a", true), plan("b", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "a",
        None,
        &page(vec![change("one", "A")], done("a-done")),
    )
    .await
    .unwrap();
    assert!(matches!(
        finalize_sync(&pool, &run.id).await,
        Err(SyncError::Conflict)
    ));
    assert!(checkpoint(&pool, &id, "a").await.unwrap().is_none());
    let previews: i64 = sqlx::query_scalar("SELECT count(*) FROM contact_import_batches")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(previews, 0);
    stage_page(
        &pool,
        &run.id,
        "b",
        None,
        &page(vec![change("one", "B")], done("b-done")),
    )
    .await
    .unwrap();
    let batches = finalize_sync(&pool, &run.id).await.unwrap();
    assert_eq!(batches.len(), 2);
    assert_eq!(
        checkpoint(&pool, &id, "a").await.unwrap().as_deref(),
        Some("a-done")
    );
    assert_eq!(
        checkpoint(&pool, &id, "b").await.unwrap().as_deref(),
        Some("b-done")
    );
}

#[tokio::test]
async fn newer_scan_fences_unlinked_old_previews_and_retains_unchanged_pending_observations() {
    let (pool, id, epoch) = setup().await;
    let first = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &first.id,
        "book",
        None,
        &page(vec![change("one", "Pending")], done("first")),
    )
    .await
    .unwrap();
    let old = finalize_sync(&pool, &first.id).await.unwrap().remove(0);
    let next = begin_sync(&pool, &id, epoch, &[plan("book", false)])
        .await
        .unwrap();
    stage_page(&pool, &next.id, "book", None, &page(vec![], done("next")))
        .await
        .unwrap();
    let latest = finalize_sync(&pool, &next.id).await.unwrap().remove(0);
    assert_eq!(latest.rows.len(), 1);
    assert_eq!(latest.rows[0].record_key, "one");
    assert!(matches!(
        commit(&pool, &old.id, &create(&old)).await,
        Err(ImportError::Conflict(_))
    ));
    commit(&pool, &latest.id, &create(&latest)).await.unwrap();
}

#[tokio::test]
async fn a_deleted_unlinked_contact_cannot_be_resurrected_by_an_old_preview() {
    let (pool, id, epoch) = setup().await;
    let first = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &first.id,
        "book",
        None,
        &page(vec![change("one", "Pending")], done("first")),
    )
    .await
    .unwrap();
    let old = finalize_sync(&pool, &first.id).await.unwrap().remove(0);
    let next = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(&pool, &next.id, "book", None, &page(vec![], done("empty")))
        .await
        .unwrap();
    let latest = finalize_sync(&pool, &next.id).await.unwrap().remove(0);
    assert!(latest.rows.is_empty());
    assert!(matches!(
        commit(&pool, &old.id, &create(&old)).await,
        Err(ImportError::Conflict(_))
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entities WHERE type='person'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn disconnect_and_simultaneous_jobs_cannot_accept_late_results() {
    let (pool, id, epoch) = setup().await;
    let plans = [plan("book", true)];
    let (a, b) = tokio::join!(
        begin_sync(&pool, &id, epoch, &plans),
        begin_sync(&pool, &id, epoch, &plans)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let run = a.or(b).unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(vec![change("one", "Late")], done("late")),
    )
    .await
    .unwrap();
    disconnect_account(&pool, &HumanIdentity::for_test("synthetic-operator"), &id)
        .await
        .unwrap();
    assert!(matches!(
        finalize_sync(&pool, &run.id).await,
        Err(SyncError::StaleAccount)
    ));
    abort_sync(&pool, &run.id, SyncError::StaleAccount)
        .await
        .unwrap();
    assert!(checkpoint(&pool, &id, "book").await.unwrap().is_none());
}

#[tokio::test]
async fn cursor_loops_missing_card_payloads_and_uid_conflicts_fail_closed() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(
            vec![],
            PageProgress::Continue {
                cursor: "a".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        Some("a"),
        &page(
            vec![],
            PageProgress::Continue {
                cursor: "b".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    assert_eq!(
        stage_page(
            &pool,
            &run.id,
            "book",
            Some("b"),
            &page(
                vec![],
                PageProgress::Continue {
                    cursor: "a".to_string()
                }
            )
        )
        .await,
        Err(SyncError::InvalidPage)
    );
    stage_page(
        &pool,
        &run.id,
        "book",
        Some("b"),
        &ProviderPage {
            changes: vec![],
            seen_record_keys: vec!["missing-card".to_string()],
            progress: done("missing"),
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        finalize_sync(&pool, &run.id).await,
        Err(SyncError::InvalidPage)
    ));
    abort_sync(&pool, &run.id, SyncError::InvalidPage)
        .await
        .unwrap();
    let next = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    let one = change("one", "One");
    let mut two = change("two", "Two");
    two.uid = one.uid.clone();
    stage_page(
        &pool,
        &next.id,
        "book",
        None,
        &page(vec![one, two], done("duplicate")),
    )
    .await
    .unwrap();
    assert!(matches!(
        finalize_sync(&pool, &next.id).await,
        Err(SyncError::InvalidPage)
    ));
    assert!(checkpoint(&pool, &id, "book").await.unwrap().is_none());
}

#[tokio::test]
async fn restart_resumes_the_durable_page_cursor() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tmp")
        .join(format!("provider-sync-{}.db", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let url = format!("sqlite://{}", path.display());
    let pool = crate::db::connect(&url).await.unwrap();
    let (id, epoch) = account(&pool).await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(
            vec![change("one", "One")],
            PageProgress::Continue {
                cursor: "second".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    pool.close().await;
    let reopened = crate::db::connect(&url).await.unwrap();
    assert_eq!(
        resumable_runs(&reopened).await.unwrap(),
        vec![run.id.clone()]
    );
    let resumed = get_run(&reopened, &run.id).await.unwrap();
    assert_eq!(
        resumed.collections[0].continuation.as_deref(),
        Some("second")
    );
    stage_page(
        &reopened,
        &run.id,
        "book",
        Some("second"),
        &page(vec![change("two", "Two")], done("done")),
    )
    .await
    .unwrap();
    assert_eq!(
        finalize_sync(&reopened, &run.id).await.unwrap()[0]
            .rows
            .len(),
        2
    );
    reopened.close().await;
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn a_later_full_page_tombstone_supersedes_an_earlier_observation() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(
            vec![change("one", "Transient")],
            PageProgress::Continue {
                cursor: "later".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    let mut removed = change("one", "Transient");
    removed.row.removed = true;
    removed.row.payload = None;
    stage_page(
        &pool,
        &run.id,
        "book",
        Some("later"),
        &page(vec![removed], done("terminal")),
    )
    .await
    .unwrap();
    let batches = finalize_sync(&pool, &run.id).await.unwrap();
    assert!(batches[0].rows.is_empty());
    assert!(known_etags(&pool, &id, "book").await.unwrap().is_empty());
}

#[tokio::test]
async fn finalization_retries_return_the_existing_preview_without_duplicate_writes() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(vec![change("one", "One")], done("terminal")),
    )
    .await
    .unwrap();
    let first = finalize_sync(&pool, &run.id).await.unwrap();
    commit(&pool, &first[0].id, &create(&first[0]))
        .await
        .unwrap();
    let retry = finalize_sync(&pool, &run.id).await.unwrap();
    assert_eq!(first[0].id, retry[0].id);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM contact_import_batches")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let sources: i64 = sqlx::query_scalar("SELECT count(*) FROM source_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sources, 1);
}

#[tokio::test]
async fn a_removed_collection_proposes_owned_source_deletion_after_complete_discovery() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    stage_page(
        &pool,
        &run.id,
        "book",
        None,
        &page(vec![change("one", "One")], done("terminal")),
    )
    .await
    .unwrap();
    let first = finalize_sync(&pool, &run.id).await.unwrap().remove(0);
    commit(&pool, &first.id, &create(&first)).await.unwrap();
    let empty = begin_sync(&pool, &id, epoch, &[]).await.unwrap();
    let latest = finalize_sync(&pool, &empty.id).await.unwrap().remove(0);
    assert_eq!(latest.rows.len(), 1);
    assert!(latest.rows[0].removed);
    let input = CommitBatchInput {
        revision: latest.revision,
        idempotency_key: "delete".to_string(),
        decisions: vec![RowDecision {
            row_id: latest.rows[0].id.clone(),
            action: RowAction::DeactivateSource,
        }],
    };
    commit(&pool, &latest.id, &input).await.unwrap();
    let active: bool = sqlx::query_scalar("SELECT active FROM source_records")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(!active);
    let people: i64 = sqlx::query_scalar("SELECT count(*) FROM entities WHERE type='person'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(people, 1);
}

#[tokio::test]
async fn oversized_or_invalid_pages_do_not_advance_the_durable_cursor() {
    let (pool, id, epoch) = setup().await;
    let run = begin_sync(&pool, &id, epoch, &[plan("book", true)])
        .await
        .unwrap();
    let oversized = ProviderPage {
        changes: vec![],
        seen_record_keys: (0..10001).map(|n| n.to_string()).collect(),
        progress: done("bad"),
    };
    assert_eq!(
        stage_page(&pool, &run.id, "book", None, &oversized).await,
        Err(SyncError::TooLarge)
    );
    let mut invalid = change("one", "One");
    invalid.row.payload = None;
    assert_eq!(
        stage_page(
            &pool,
            &run.id,
            "book",
            None,
            &page(vec![invalid], done("bad"))
        )
        .await,
        Err(SyncError::InvalidPage)
    );
    assert!(get_run(&pool, &run.id).await.unwrap().collections[0]
        .continuation
        .is_none());
    assert!(!get_run(&pool, &run.id).await.unwrap().collections[0].complete);
}
