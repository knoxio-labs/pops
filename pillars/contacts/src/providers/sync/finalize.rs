//! Account-wide cache reconciliation and guarded preview finalization.

use super::{repo, SyncCollection, SyncError, SyncRun};
use crate::imports::model::{ImportBatch, ImportPayload, StageBatchInput, StageRowInput};
use crate::imports::service::{stage_in_transaction, MAX_PREVIEW_BYTES, MAX_ROWS};
use sqlx::{SqliteConnection, SqlitePool};

/// Complete every collection atomically: reconcile the provider cache, stage full
/// current import previews, and advance terminal checkpoints in one transaction.
/// Canonical directory writes remain explicit shared import decisions.
pub async fn finalize_sync(pool: &SqlitePool, id: &str) -> Result<Vec<ImportBatch>, SyncError> {
    finalize_inner(pool, id, None).await
}

/// Finalize only while the worker claim remains current.
pub async fn finalize_claimed(
    pool: &SqlitePool,
    lease: &super::lease::RunLease,
    now: i64,
) -> Result<Vec<ImportBatch>, SyncError> {
    finalize_inner(pool, &lease.run_id, Some((lease, now))).await
}

async fn finalize_inner(
    pool: &SqlitePool,
    id: &str,
    claim: Option<(&super::lease::RunLease, i64)>,
) -> Result<Vec<ImportBatch>, SyncError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some((lease, now)) = claim {
        super::lease::fence(&mut tx, lease, now).await?;
    }
    let existing = repo::run(&mut tx, id).await?;
    if existing.status == "completed" {
        let ids: Vec<String> = sqlx::query_scalar("SELECT g.batch_id FROM provider_batch_guards g JOIN contact_import_batches b ON b.id=g.batch_id WHERE g.run_id=?1 ORDER BY b.collection_key")
            .bind(id).fetch_all(&mut *tx).await?;
        let mut batches = Vec::new();
        for batch_id in ids {
            batches.push(
                crate::imports::repo::get_batch(&mut tx, &batch_id)
                    .await
                    .map_err(|_| SyncError::Storage)?,
            );
        }
        tx.commit().await?;
        return Ok(batches);
    }
    let run = repo::running(&mut tx, id).await?;
    if run
        .collections
        .iter()
        .any(|collection| !collection.complete)
    {
        return Err(SyncError::Conflict);
    }
    let mut batches = Vec::new();
    for collection in &run.collections {
        apply_cache(&mut tx, &run, collection).await?;
        let unresolved: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_run_seen seen LEFT JOIN provider_records records ON records.account_id=?1 AND records.collection_key=seen.collection_key AND records.record_key=seen.record_key WHERE seen.run_id=?2 AND seen.collection_key=?3 AND (records.record_key IS NULL OR records.active=0))")
            .bind(&run.account_id).bind(id).bind(&collection.key).fetch_one(&mut *tx).await?;
        let duplicate_uid: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_records WHERE account_id=?1 AND collection_key=?2 AND active=1 AND uid IS NOT NULL GROUP BY uid HAVING count(*)>1)")
            .bind(&run.account_id).bind(&collection.key).fetch_one(&mut *tx).await?;
        if unresolved || duplicate_uid {
            return Err(SyncError::InvalidPage);
        }
        let rows = preview_rows(&mut tx, &run.account_id, &collection.key).await?;
        let batch = stage_in_transaction(
            &mut tx,
            &StageBatchInput {
                account_id: run.account_id.clone(),
                collection_key: collection.key.clone(),
                rows,
            },
        )
        .await
        .map_err(|_| SyncError::InvalidPage)?;
        if batch.rows.iter().any(|row| !row.errors.is_empty()) {
            return Err(SyncError::InvalidPage);
        }
        sqlx::query("INSERT INTO provider_collection_states(account_id,collection_key,checkpoint,latest_run_id) SELECT ?1,collection_key,checkpoint,?2 FROM provider_run_collections WHERE run_id=?2 AND collection_key=?3 ON CONFLICT(account_id,collection_key) DO UPDATE SET checkpoint=excluded.checkpoint,latest_run_id=excluded.latest_run_id")
            .bind(&run.account_id).bind(id).bind(&collection.key).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO provider_batch_guards(batch_id,run_id) VALUES(?1,?2)")
            .bind(&batch.id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        batches.push(batch);
    }
    let (active, bytes): (i64,i64) = sqlx::query_as("SELECT count(*),coalesce(sum(length(CAST(payload AS BLOB))+length(CAST(record_key AS BLOB))),0) FROM provider_records WHERE account_id=?1 AND active=1")
        .bind(&run.account_id).fetch_one(&mut *tx).await?;
    if active > MAX_ROWS as i64 || bytes > MAX_PREVIEW_BYTES as i64 {
        return Err(SyncError::TooLarge);
    }
    sqlx::query("UPDATE provider_sync_runs SET status='completed' WHERE id=?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    repo::clear(&mut tx, id).await?;
    tx.commit().await?;
    Ok(batches)
}

async fn apply_cache(
    conn: &mut SqliteConnection,
    run: &SyncRun,
    collection: &SyncCollection,
) -> Result<(), SyncError> {
    if collection.full_snapshot {
        sqlx::query("INSERT INTO provider_records(account_id,collection_key,record_key,active) SELECT account_id,collection_key,record_key,0 FROM source_records WHERE account_id=?1 AND collection_key=?2 AND active=1 AND NOT EXISTS(SELECT 1 FROM provider_run_seen WHERE run_id=?3 AND collection_key=?2 AND record_key=source_records.record_key) ON CONFLICT(account_id,collection_key,record_key) DO NOTHING")
            .bind(&run.account_id).bind(&collection.key).bind(&run.id).execute(&mut *conn).await?;
        sqlx::query("UPDATE provider_records SET active=0 WHERE account_id=?1 AND collection_key=?2 AND NOT EXISTS(SELECT 1 FROM provider_run_seen WHERE run_id=?3 AND collection_key=?2 AND record_key=provider_records.record_key)").bind(&run.account_id).bind(&collection.key).bind(&run.id).execute(&mut *conn).await?;
    }
    let changes:Vec<(String,Option<String>,Option<String>)>=sqlx::query_as("SELECT observation,etag,uid FROM provider_run_changes WHERE run_id=?1 AND collection_key=?2 ORDER BY record_key").bind(&run.id).bind(&collection.key).fetch_all(&mut *conn).await?;
    for (observation, etag, uid) in changes {
        let row: StageRowInput = serde_json::from_str(&observation)?;
        let payload = row
            .payload
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        sqlx::query("INSERT INTO provider_records(account_id,collection_key,record_key,payload,etag,uid,active) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(account_id,collection_key,record_key) DO UPDATE SET payload=coalesce(excluded.payload,provider_records.payload),etag=CASE WHEN excluded.active=1 THEN excluded.etag ELSE coalesce(excluded.etag,provider_records.etag) END,uid=CASE WHEN excluded.active=1 THEN excluded.uid ELSE coalesce(excluded.uid,provider_records.uid) END,active=excluded.active")
            .bind(&run.account_id).bind(&collection.key).bind(row.record_key).bind(payload).bind(etag).bind(uid).bind(!row.removed).execute(&mut *conn).await?;
    }
    Ok(())
}

async fn preview_rows(
    conn: &mut SqliteConnection,
    account: &str,
    collection: &str,
) -> Result<Vec<StageRowInput>, SyncError> {
    let records:Vec<(String,Option<String>,bool)>=sqlx::query_as("SELECT record_key,payload,active FROM provider_records WHERE account_id=?1 AND collection_key=?2 AND (active=1 OR EXISTS(SELECT 1 FROM source_records WHERE account_id=?1 AND collection_key=?2 AND record_key=provider_records.record_key AND active=1)) ORDER BY record_key").bind(account).bind(collection).fetch_all(conn).await?;
    records
        .into_iter()
        .map(|(record_key, payload, active)| {
            Ok(StageRowInput {
                record_key,
                payload: if active {
                    Some(serde_json::from_str::<ImportPayload>(
                        &payload.ok_or(SyncError::InvalidPage)?,
                    )?)
                } else {
                    None
                },
                removed: !active,
                errors: Vec::new(),
            })
        })
        .collect()
}
