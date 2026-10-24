use super::service::SyncError;
use super::{SyncCollection, SyncRun};
use crate::providers::store::{fence_account, AccountEpoch};
use sqlx::{SqliteConnection, SqlitePool};

#[derive(sqlx::FromRow)]
struct RunRow {
    id: String,
    account_id: String,
    account_epoch: i64,
    status: String,
}

pub(super) async fn run(conn: &mut SqliteConnection, id: &str) -> Result<SyncRun, SyncError> {
    let row: RunRow = sqlx::query_as(
        "SELECT id,account_id,account_epoch,status FROM provider_sync_runs WHERE id=?1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or(SyncError::NotFound)?;
    let collections = sqlx::query_as("SELECT collection_key AS key,full_snapshot,complete,base_checkpoint AS checkpoint,continuation FROM provider_run_collections WHERE run_id=?1 ORDER BY collection_key")
        .bind(id).fetch_all(conn).await?;
    Ok(SyncRun {
        id: row.id,
        account_id: row.account_id,
        epoch: AccountEpoch(row.account_epoch),
        status: row.status,
        collections,
    })
}

pub(super) async fn running(conn: &mut SqliteConnection, id: &str) -> Result<SyncRun, SyncError> {
    let run = run(conn, id).await?;
    if run.status != "running" {
        return Err(SyncError::Conflict);
    }
    fence_account(conn, &run.account_id, run.epoch).await?;
    Ok(run)
}

pub(super) async fn clear(conn: &mut SqliteConnection, id: &str) -> Result<(), SyncError> {
    for statement in [
        "DELETE FROM provider_run_changes WHERE run_id=?1",
        "DELETE FROM provider_run_seen WHERE run_id=?1",
        "DELETE FROM provider_run_cursors WHERE run_id=?1",
    ] {
        sqlx::query(statement).bind(id).execute(&mut *conn).await?;
    }
    Ok(())
}

pub(super) async fn get(pool: &SqlitePool, id: &str) -> Result<SyncRun, SyncError> {
    let mut connection = pool.acquire().await?;
    run(&mut connection, id).await
}

pub(super) fn collection<'a>(run: &'a SyncRun, key: &str) -> Result<&'a SyncCollection, SyncError> {
    run.collections
        .iter()
        .find(|collection| collection.key == key)
        .ok_or(SyncError::InvalidPage)
}
