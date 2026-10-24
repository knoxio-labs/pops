//! Whole-batch ready imports are proven server-side and applied in one reserved transaction.

use sqlx::{SqliteConnection, SqlitePool};

use super::ready_model::{ReadyBatchInput, ReadyBatchReceipt, ReadySummary};
use super::service::ImportError;

/// Derive complete ready counts and a proof covering all pending-batch evidence in this snapshot.
/// Persisted unprocessed review state is held even if the identity engine later says source_identity.
pub async fn summary(
    conn: &mut SqliteConnection,
    batch_id: &str,
) -> Result<ReadySummary, ImportError> {
    Ok(super::ready_plan::load(conn, batch_id).await?.summary)
}

/// Atomically apply only freshly server-resolved rows. Exact receipts precede all freshness fences.
/// A stale proof, account change, conflict, write-budget overflow or late failure rolls back every row.
pub async fn apply(
    pool: &SqlitePool,
    batch_id: &str,
    input: &ReadyBatchInput,
) -> Result<ReadyBatchReceipt, ImportError> {
    if input.batch_revision < 1
        || input.directory_revision < 0
        || input.proposal_revision.len() != 64
        || !input
            .proposal_revision
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || input.idempotency_key.trim().is_empty()
        || input.idempotency_key.len() > 128
    {
        return Err(ImportError::Invalid(
            "A bounded retry key and complete ready proof are required",
        ));
    }
    let hash = crate::digest::sha256_hex(&serde_json::to_vec(input)?);
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let stored: Option<(String,String)> = sqlx::query_as("SELECT body_hash,receipt FROM contact_import_ready_receipts WHERE batch_id=?1 AND idempotency_key=?2").bind(batch_id).bind(&input.idempotency_key).fetch_optional(&mut *tx).await?;
    if let Some((stored_hash, receipt)) = stored {
        if stored_hash != hash {
            return Err(ImportError::Conflict(
                "The idempotency key was used with a different request",
            ));
        }
        return Ok(serde_json::from_str(&receipt)?);
    }
    let batch = super::repo::get_batch(&mut tx, batch_id).await?;
    super::service::validate_batch_fences(&mut tx, &batch).await?;
    let plan = super::ready_plan::load(&mut tx, batch_id).await?;
    if input.batch_revision != plan.batch.revision
        || input.directory_revision != plan.directory_revision
        || input.proposal_revision != plan.summary.proposal_revision
    {
        return Err(ImportError::Conflict(
            "Ready imports changed; reload the complete batch",
        ));
    }
    if plan.expanded_writes > super::ready_plan::MAX_EXPANDED_WRITES {
        return Err(ImportError::Invalid(
            "Ready imports exceed the atomic write budget",
        ));
    }
    let receipt = super::ready_apply::apply(&mut tx, plan, &hash).await?;
    sqlx::query("INSERT INTO contact_import_ready_receipts(batch_id,idempotency_key,body_hash,receipt) VALUES(?1,?2,?3,?4)").bind(batch_id).bind(&input.idempotency_key).bind(hash).bind(serde_json::to_string(&receipt)?).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(receipt)
}
