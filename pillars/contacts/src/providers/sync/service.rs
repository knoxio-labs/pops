//! Atomic scan staging, cached observations, checkpoints and guarded import previews.

use super::{repo, CollectionPlan, PageProgress, ProviderPage, SyncRun};
use crate::digest::sha256_hex;

use crate::imports::service::{MAX_PREVIEW_BYTES, MAX_ROWS};
use crate::providers::store::{fence_account, AccountEpoch, ProviderStoreError};
use crate::sources::model::SourceRecordInput;
use crate::sources::repo::validate_record;
use sqlx::{SqliteConnection, SqlitePool};
use std::collections::{BTreeMap, HashSet};

/// Sanitized scan failures; no provider payload, cursor or account key is retained.
#[derive(Debug, PartialEq, Eq)]
pub enum SyncError {
    /// A run is missing.
    NotFound,
    /// A run/page is already complete or another run owns this account.
    Conflict,
    /// A disconnected/replaced account cannot accept late results.
    StaleAccount,
    /// Provider output is malformed or its continuation repeats.
    InvalidPage,
    /// The bounded scan exceeds ten thousand records or five MiB of staging.
    TooLarge,
    /// Storage failed without committing partial live state.
    Storage,
}
impl From<ProviderStoreError> for SyncError {
    fn from(error: ProviderStoreError) -> Self {
        match error {
            ProviderStoreError::StaleAccount => Self::StaleAccount,
            _ => Self::Storage,
        }
    }
}
impl From<sqlx::Error> for SyncError {
    fn from(_: sqlx::Error) -> Self {
        Self::Storage
    }
}
impl From<serde_json::Error> for SyncError {
    fn from(_: serde_json::Error) -> Self {
        Self::InvalidPage
    }
}
impl std::fmt::Display for SyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::NotFound => "CONTACTS_PROVIDER_RUN_NOT_FOUND",
            Self::Conflict => "CONTACTS_PROVIDER_RUN_CONFLICT",
            Self::StaleAccount => "CONTACTS_PROVIDER_ACCOUNT_CHANGED",
            Self::InvalidPage => "CONTACTS_PROVIDER_PAGE_INVALID",
            Self::TooLarge => "CONTACTS_PROVIDER_SCAN_TOO_LARGE",
            Self::Storage => "CONTACTS_PROVIDER_SYNC_UNAVAILABLE",
        })
    }
}
impl std::error::Error for SyncError {}

/// Begin one durable, serialized account scan after complete collection discovery.
/// Missing previously known collections become empty full snapshots only when
/// every discovered collection later completes successfully.
pub async fn begin_sync(
    pool: &SqlitePool,
    account_id: &str,
    epoch: AccountEpoch,
    plans: &[CollectionPlan],
) -> Result<SyncRun, SyncError> {
    let keys: HashSet<&str> = plans.iter().map(|plan| plan.key.as_str()).collect();
    if plans.len() > 32 || keys.len() != plans.len() || keys.iter().any(|key| !valid_key(key)) {
        return Err(SyncError::InvalidPage);
    }
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    fence_account(&mut tx, account_id, epoch).await?;
    let old:Vec<String> = sqlx::query_scalar("SELECT id FROM provider_sync_runs WHERE account_id=?1 AND status='running' AND account_epoch<>?2")
        .bind(account_id).bind(epoch.0).fetch_all(&mut *tx).await?;
    for id in old {
        sqlx::query("UPDATE provider_sync_runs SET status='cancelled' WHERE id=?1")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        repo::clear(&mut tx, &id).await?;
    }
    let busy: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM provider_sync_runs WHERE account_id=?1 AND status='running')",
    )
    .bind(account_id)
    .fetch_one(&mut *tx)
    .await?;
    if busy {
        return Err(SyncError::Conflict);
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO provider_sync_runs(id,account_id,account_epoch,status,started_at) VALUES(?1,?2,?3,'running',?4)")
        .bind(&id).bind(account_id).bind(epoch.0).bind(crate::time::now_rfc3339()).execute(&mut *tx).await?;
    let previous: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT collection_key,checkpoint FROM provider_collection_states WHERE account_id=?1",
    )
    .bind(account_id)
    .fetch_all(&mut *tx)
    .await?;
    for plan in plans {
        let checkpoint = previous
            .iter()
            .find(|(key, _)| key == &plan.key)
            .and_then(|(_, checkpoint)| checkpoint.as_deref());
        if !plan.full_snapshot && checkpoint.is_none() {
            return Err(SyncError::InvalidPage);
        }
        sqlx::query("INSERT INTO provider_run_collections(run_id,collection_key,full_snapshot,base_checkpoint) VALUES(?1,?2,?3,?4)")
            .bind(&id).bind(&plan.key).bind(plan.full_snapshot).bind(if plan.full_snapshot {None}else{checkpoint}).execute(&mut *tx).await?;
    }
    for (key, _) in previous {
        if !keys.contains(key.as_str()) {
            sqlx::query("INSERT INTO provider_run_collections(run_id,collection_key,full_snapshot,complete) VALUES(?1,?2,1,1)").bind(&id).bind(key).execute(&mut *tx).await?;
        }
    }
    let run = repo::run(&mut tx, &id).await?;
    tx.commit().await?;
    Ok(run)
}

/// Read durable run progress after a restart. Opaque cursors remain server-side.
pub async fn get_run(pool: &SqlitePool, id: &str) -> Result<SyncRun, SyncError> {
    repo::get(pool, id).await
}

/// List unfinished jobs for a process runner to resume; each account has at most one.
pub async fn resumable_runs(pool: &SqlitePool) -> Result<Vec<String>, SyncError> {
    Ok(sqlx::query_scalar(
        "SELECT id FROM provider_sync_runs WHERE status='running' ORDER BY started_at,id",
    )
    .fetch_all(pool)
    .await?)
}

/// Stage one validated page without changing cached records, import previews or
/// checkpoints. The requested cursor must still match durable progress.
pub async fn stage_page(
    pool: &SqlitePool,
    run_id: &str,
    key: &str,
    requested_cursor: Option<&str>,
    page: &ProviderPage,
) -> Result<(), SyncError> {
    stage_page_inner(pool, run_id, key, requested_cursor, page, None).await
}

/// Stage a worker result only while its durable claim is still current.
pub async fn stage_page_claimed(
    pool: &SqlitePool,
    lease: &super::lease::RunLease,
    key: &str,
    requested_cursor: Option<&str>,
    page: &ProviderPage,
    now: i64,
) -> Result<(), SyncError> {
    stage_page_inner(
        pool,
        &lease.run_id,
        key,
        requested_cursor,
        page,
        Some((lease, now)),
    )
    .await
}

async fn stage_page_inner(
    pool: &SqlitePool,
    run_id: &str,
    key: &str,
    requested_cursor: Option<&str>,
    page: &ProviderPage,
    claim: Option<(&super::lease::RunLease, i64)>,
) -> Result<(), SyncError> {
    if page.changes.len() > MAX_ROWS || page.seen_record_keys.len() > MAX_ROWS {
        return Err(SyncError::TooLarge);
    }
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some((lease, now)) = claim {
        super::lease::fence(&mut tx, lease, now).await?;
    }
    let run = repo::running(&mut tx, run_id).await?;
    let collection = repo::collection(&run, key)?;
    if collection.complete || collection.continuation.as_deref() != requested_cursor {
        return Err(SyncError::Conflict);
    }
    let (continuation, checkpoint, complete) = match &page.progress {
        PageProgress::Continue { cursor }
            if !cursor.is_empty()
                && cursor.len() <= 16384
                && Some(cursor.as_str()) != requested_cursor =>
        {
            (Some(cursor.as_str()), None, false)
        }
        PageProgress::Continue { .. } => return Err(SyncError::InvalidPage),
        PageProgress::Complete { checkpoint }
            if checkpoint
                .as_ref()
                .is_none_or(|checkpoint| !checkpoint.is_empty() && checkpoint.len() <= 16384) =>
        {
            (None, checkpoint.as_deref(), true)
        }
        PageProgress::Complete { .. } => return Err(SyncError::InvalidPage),
    };
    if let Some(cursor) = continuation {
        let seen:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_run_cursors WHERE run_id=?1 AND collection_key=?2 AND cursor_hash=?3)").bind(run_id).bind(key).bind(sha256_hex(cursor.as_bytes())).fetch_one(&mut *tx).await?;
        if seen {
            return Err(SyncError::InvalidPage);
        }
        sqlx::query(
            "INSERT INTO provider_run_cursors(run_id,collection_key,cursor_hash) VALUES(?1,?2,?3)",
        )
        .bind(run_id)
        .bind(key)
        .bind(sha256_hex(cursor.as_bytes()))
        .execute(&mut *tx)
        .await?;
    }
    for record_key in &page.seen_record_keys {
        if !valid_key(record_key) {
            return Err(SyncError::InvalidPage);
        }
        mark_seen(&mut tx, run_id, key, record_key).await?;
    }
    let mut page_keys = HashSet::new();
    for change in &page.changes {
        if !page_keys.insert(change.row.record_key.as_str()) {
            return Err(SyncError::InvalidPage);
        }
        let row = &change.row;
        if !valid_key(&row.record_key)
            || !row.errors.is_empty()
            || row.removed == row.payload.is_some()
            || change.etag.as_ref().is_some_and(|value| value.len() > 4096)
            || change.uid.as_ref().is_some_and(|value| value.len() > 4096)
        {
            return Err(SyncError::InvalidPage);
        }
        if let Some(payload) = &row.payload {
            validate_record(&SourceRecordInput {
                account_id: run.account_id.clone(),
                collection_key: key.to_string(),
                record_key: row.record_key.clone(),
                entity_id: "provider-preview".to_string(),
                display_name: payload.display_name.clone(),
                name: payload.name.clone(),
                points: payload.points.clone(),
            })
            .map_err(|_| SyncError::InvalidPage)?;
            mark_seen(&mut tx, run_id, key, &row.record_key).await?;
        }
        if row.removed {
            sqlx::query("DELETE FROM provider_run_seen WHERE run_id=?1 AND collection_key=?2 AND record_key=?3").bind(run_id).bind(key).bind(&row.record_key).execute(&mut *tx).await?;
        }
        sqlx::query("INSERT INTO provider_run_changes(run_id,collection_key,record_key,observation,etag,uid) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(run_id,collection_key,record_key) DO UPDATE SET observation=excluded.observation,etag=excluded.etag,uid=excluded.uid")
            .bind(run_id).bind(key).bind(&row.record_key).bind(serde_json::to_string(row)?).bind(&change.etag).bind(&change.uid).execute(&mut *tx).await?;
    }
    let (count,bytes):(i64,i64)=sqlx::query_as("SELECT count(*),coalesce(sum(length(CAST(observation AS BLOB))+length(coalesce(etag,''))+length(coalesce(uid,''))),0) FROM provider_run_changes WHERE run_id=?1").bind(run_id).fetch_one(&mut *tx).await?;
    let (seen,seen_bytes):(i64,i64)=sqlx::query_as("SELECT count(*),coalesce(sum(length(CAST(record_key AS BLOB))),0) FROM provider_run_seen WHERE run_id=?1").bind(run_id).fetch_one(&mut *tx).await?;
    if count > MAX_ROWS as i64
        || seen > MAX_ROWS as i64
        || bytes + seen_bytes > MAX_PREVIEW_BYTES as i64
    {
        return Err(SyncError::TooLarge);
    }
    let pages: i64 =
        sqlx::query_scalar("SELECT count(*) FROM provider_run_cursors WHERE run_id=?1")
            .bind(run_id)
            .fetch_one(&mut *tx)
            .await?;
    if pages > 1000 {
        return Err(SyncError::TooLarge);
    }
    sqlx::query("UPDATE provider_run_collections SET continuation=?1,checkpoint=?2,complete=?3 WHERE run_id=?4 AND collection_key=?5").bind(continuation).bind(checkpoint).bind(complete).bind(run_id).bind(key).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

async fn mark_seen(
    conn: &mut SqliteConnection,
    run: &str,
    collection: &str,
    key: &str,
) -> Result<(), SyncError> {
    sqlx::query("INSERT INTO provider_run_seen(run_id,collection_key,record_key) VALUES(?1,?2,?3) ON CONFLICT DO NOTHING").bind(run).bind(collection).bind(key).execute(conn).await?;
    Ok(())
}

/// Mark a failed/cancelled run and erase its staging without changing previous
/// records, checkpoints or durable previews. Error details are fixed safe codes.
pub async fn abort_sync(pool: &SqlitePool, id: &str, error: SyncError) -> Result<(), SyncError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let changed = sqlx::query(
        "UPDATE provider_sync_runs SET status=?1,error_code=?2 WHERE id=?3 AND status='running'",
    )
    .bind(if error == SyncError::StaleAccount {
        "cancelled"
    } else {
        "failed"
    })
    .bind(error.to_string())
    .bind(id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(SyncError::Conflict);
    }
    repo::clear(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

/// Read a terminal checkpoint associated with this exact account and collection.
pub async fn checkpoint(
    pool: &SqlitePool,
    account: &str,
    collection: &str,
) -> Result<Option<String>, SyncError> {
    let row:Option<Option<String>>=sqlx::query_scalar("SELECT checkpoint FROM provider_collection_states WHERE account_id=?1 AND collection_key=?2").bind(account).bind(collection).fetch_optional(pool).await?;
    Ok(row.flatten())
}

/// Provide cached active resource revisions for complete CardDAV enumeration.
pub async fn known_etags(
    pool: &SqlitePool,
    account: &str,
    collection: &str,
) -> Result<BTreeMap<String, String>, SyncError> {
    let rows:Vec<(String,String)>=sqlx::query_as("SELECT record_key,etag FROM provider_records WHERE account_id=?1 AND collection_key=?2 AND active=1 AND etag IS NOT NULL").bind(account).bind(collection).fetch_all(pool).await?;
    Ok(rows.into_iter().collect())
}

/// Reject an import preview superseded by a later successful scan. File previews
/// have no provider guard and retain the shared import contract unchanged.
pub async fn validate_batch(
    conn: &mut SqliteConnection,
    batch_id: &str,
) -> Result<(), ProviderStoreError> {
    let stale:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_batch_guards g JOIN contact_import_batches b ON b.id=g.batch_id LEFT JOIN provider_collection_states s ON s.account_id=b.account_id AND s.collection_key=b.collection_key WHERE g.batch_id=?1 AND (s.latest_run_id IS NULL OR s.latest_run_id<>g.run_id))").bind(batch_id).fetch_one(conn).await.map_err(|_|ProviderStoreError::Unavailable)?;
    if stale {
        Err(ProviderStoreError::StaleAccount)
    } else {
        Ok(())
    }
}

fn valid_key(key: &str) -> bool {
    !key.trim().is_empty() && key.len() <= 1024
}
