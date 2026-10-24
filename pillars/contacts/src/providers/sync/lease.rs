//! Durable worker ownership and bounded retry scheduling for provider scans.

use super::{repo, SyncError};
use sqlx::{SqliteConnection, SqlitePool};

/// A short-lived durable worker claim. Expiry/replacement rejects late results.
pub struct RunLease {
    /// Run being processed; neither opaque cursors nor credentials are exposed.
    pub run_id: String,
    owner: String,
}

/// Claim one ready run, including expired claims left by a stopped process.
pub async fn claim(pool: &SqlitePool, now: i64) -> Result<Option<RunLease>, SyncError> {
    let owner = uuid::Uuid::new_v4().to_string();
    let id:Option<String>=sqlx::query_scalar("UPDATE provider_sync_runs SET lease_owner=?1,lease_until=?2 WHERE id=(SELECT id FROM provider_sync_runs WHERE status='running' AND next_attempt_at<=?3 AND lease_until<=?3 ORDER BY started_at,id LIMIT 1) RETURNING id")
        .bind(&owner).bind(now.saturating_add(300)).bind(now).fetch_optional(pool).await?;
    Ok(id.map(|run_id| RunLease { run_id, owner }))
}

pub(super) async fn fence(
    conn: &mut SqliteConnection,
    lease: &RunLease,
    now: i64,
) -> Result<(), SyncError> {
    let changed=sqlx::query("UPDATE provider_sync_runs SET lease_until=lease_until WHERE id=?1 AND status='running' AND lease_owner=?2 AND lease_until>?3")
        .bind(&lease.run_id).bind(&lease.owner).bind(now).execute(conn).await?.rows_affected();
    if changed == 0 {
        Err(SyncError::Conflict)
    } else {
        Ok(())
    }
}

/// Release successful page ownership, or persist bounded retries. After five
/// transient operation failures the run fails without advancing its checkpoint.
pub async fn release(
    pool: &SqlitePool,
    lease: &RunLease,
    retryable: bool,
    now: i64,
) -> Result<(), SyncError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    fence(&mut tx, lease, now).await?;
    let attempts: i64 =
        sqlx::query_scalar("SELECT attempt_count FROM provider_sync_runs WHERE id=?1")
            .bind(&lease.run_id)
            .fetch_one(&mut *tx)
            .await?;
    if retryable && attempts >= 4 {
        sqlx::query("UPDATE provider_sync_runs SET status='failed',error_code='CONTACTS_PROVIDER_RETRY_EXHAUSTED',lease_owner=NULL,lease_until=0 WHERE id=?1").bind(&lease.run_id).execute(&mut *tx).await?;
        repo::clear(&mut tx, &lease.run_id).await?;
    } else {
        let next = if retryable {
            now.saturating_add(60 * (1 << attempts.min(4)))
        } else {
            0
        };
        sqlx::query("UPDATE provider_sync_runs SET lease_owner=NULL,lease_until=0,next_attempt_at=?1,attempt_count=CASE WHEN ?2 THEN attempt_count+1 ELSE attempt_count END WHERE id=?3")
            .bind(next).bind(retryable).bind(&lease.run_id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Discard one expired incremental staging stream and retry it as a full scan.
/// A second reset in the same run is rejected rather than looping indefinitely.
pub async fn reset_full(
    pool: &SqlitePool,
    lease: &RunLease,
    key: &str,
    now: i64,
) -> Result<(), SyncError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    fence(&mut tx, lease, now).await?;
    repo::running(&mut tx, &lease.run_id).await?;
    let changed=sqlx::query("UPDATE provider_run_collections SET full_snapshot=1,base_checkpoint=NULL,continuation=NULL,checkpoint=NULL,complete=0,reset_count=reset_count+1 WHERE run_id=?1 AND collection_key=?2 AND reset_count=0")
        .bind(&lease.run_id).bind(key).execute(&mut *tx).await?.rows_affected();
    if changed == 0 {
        return Err(SyncError::InvalidPage);
    }
    for statement in [
        "DELETE FROM provider_run_changes WHERE run_id=?1 AND collection_key=?2",
        "DELETE FROM provider_run_seen WHERE run_id=?1 AND collection_key=?2",
        "DELETE FROM provider_run_cursors WHERE run_id=?1 AND collection_key=?2",
    ] {
        sqlx::query(statement)
            .bind(&lease.run_id)
            .bind(key)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Fail a claimed run with a fixed caller-owned code. Revoked grants pause future
/// scheduling while preserving all existing local and source observations.
pub async fn fail(
    pool: &SqlitePool,
    lease: &RunLease,
    code: &'static str,
    reauthorize: bool,
    now: i64,
) -> Result<(), SyncError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    fence(&mut tx, lease, now).await?;
    let run = repo::running(&mut tx, &lease.run_id).await?;
    if reauthorize {
        sqlx::query("UPDATE provider_accounts SET reauthorization_required=1 WHERE account_id=?1 AND epoch=?2")
            .bind(&run.account_id).bind(run.epoch.0).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE provider_sync_runs SET status='failed',error_code=?1,lease_owner=NULL,lease_until=0 WHERE id=?2")
        .bind(code).bind(&lease.run_id).execute(&mut *tx).await?;
    repo::clear(&mut tx, &lease.run_id).await?;
    tx.commit().await?;
    Ok(())
}
