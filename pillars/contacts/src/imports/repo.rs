//! Transaction-composable persistence for import previews and retry receipts.

use sqlx::SqliteConnection;

use super::model::{CommitReceipt, ImportBatch, ImportRow};
use super::service::ImportError;

/// Insert a preview and all rows into the caller's transaction.
pub async fn insert_batch(
    conn: &mut SqliteConnection,
    batch: &ImportBatch,
) -> Result<(), ImportError> {
    sqlx::query("INSERT INTO contact_import_batches(id,account_id,collection_key,revision,created_at,source_epoch) VALUES(?1,?2,?3,?4,?5,?6)")
        .bind(&batch.id).bind(&batch.account_id).bind(&batch.collection_key).bind(batch.revision).bind(&batch.created_at).bind(batch.source_epoch).execute(&mut *conn).await?;
    for row in &batch.rows {
        sqlx::query(
            "INSERT INTO contact_import_rows(id,batch_id,ordinal,preview) VALUES(?1,?2,?3,?4)",
        )
        .bind(&row.id)
        .bind(&batch.id)
        .bind(row.ordinal)
        .bind(serde_json::to_string(row)?)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Read a complete bounded batch, projecting processing state independently of its preview.
pub async fn get_batch(conn: &mut SqliteConnection, id: &str) -> Result<ImportBatch, ImportError> {
    let row: Option<(String, String, i64, String, Option<i64>)> = sqlx::query_as("SELECT account_id,collection_key,revision,created_at,source_epoch FROM contact_import_batches WHERE id=?1")
        .bind(id).fetch_optional(&mut *conn).await?;
    let (account_id, collection_key, revision, created_at, source_epoch) =
        row.ok_or(ImportError::NotFound)?;
    let stored: Vec<(String, bool)> = sqlx::query_as(
        "SELECT preview,processed FROM contact_import_rows WHERE batch_id=?1 ORDER BY ordinal",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let mut rows = Vec::with_capacity(stored.len());
    for (preview, processed) in stored {
        let mut row: ImportRow = serde_json::from_str(&preview)?;
        row.processed = processed;
        rows.push(row);
    }
    Ok(ImportBatch {
        id: id.to_string(),
        account_id,
        collection_key,
        source_epoch,
        revision,
        created_at,
        rows,
    })
}

/// Read retry identity before inspecting a preview revision, so completed retries remain valid.
pub async fn get_receipt(
    conn: &mut SqliteConnection,
    batch_id: &str,
    key: &str,
) -> Result<Option<(String, CommitReceipt)>, ImportError> {
    let stored: Option<(String,String)> = sqlx::query_as("SELECT body_hash,receipt FROM contact_import_receipts WHERE batch_id=?1 AND idempotency_key=?2")
        .bind(batch_id).bind(key).fetch_optional(conn).await?;
    stored
        .map(|(hash, receipt)| Ok((hash, serde_json::from_str(&receipt)?)))
        .transpose()
}

/// Advance the preview and retain the receipt within the same transaction as directory writes.
pub async fn finish_commit(
    conn: &mut SqliteConnection,
    key: &str,
    hash: &str,
    receipt: &CommitReceipt,
) -> Result<(), ImportError> {
    for row in &receipt.rows {
        sqlx::query("UPDATE contact_import_rows SET processed=1 WHERE id=?1 AND batch_id=?2")
            .bind(&row.row_id)
            .bind(&receipt.batch_id)
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query("UPDATE contact_import_batches SET revision=?1 WHERE id=?2")
        .bind(receipt.revision)
        .bind(&receipt.batch_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query("INSERT INTO contact_import_receipts(batch_id,idempotency_key,body_hash,receipt) VALUES(?1,?2,?3,?4)")
        .bind(&receipt.batch_id).bind(key).bind(hash).bind(serde_json::to_string(receipt)?).execute(conn).await?;
    Ok(())
}
