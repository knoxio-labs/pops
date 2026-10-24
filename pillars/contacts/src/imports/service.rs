//! Bounded preview staging and atomic, revision-checked selected-row commits.

use std::collections::{HashMap, HashSet};

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{
    CommitBatchInput, CommitReceipt, CommittedRow, ImportBatch, ImportPayload, ImportRow,
    RowAction, RowIssue, RowProposal, StageBatchInput,
};
use super::repo;
pub use crate::digest::sha256_hex;
use crate::persons::repo::{create_person, PersonError};
use crate::providers::store::{fence_account, AccountEpoch, ProviderStoreError};
use crate::sources::model::{SourceRecord, SourceRecordInput};
use crate::sources::repo::{
    apply_record, deactivate_record, find_record, validate_record, SourceError,
};

/// Maximum staged rows and selected decisions in a single bounded batch.
pub const MAX_ROWS: usize = 10_000;
/// Maximum aggregate serialized observations accepted from any import transport.
pub const MAX_PREVIEW_BYTES: usize = 5 * 1024 * 1024;

/// Safe import failure classes. Raw storage errors are never copied into wire messages.
#[derive(Debug)]
pub enum ImportError {
    Invalid(&'static str),
    Conflict(&'static str),
    NotFound,
    Storage,
}

impl From<sqlx::Error> for ImportError {
    fn from(_: sqlx::Error) -> Self {
        Self::Storage
    }
}

impl From<serde_json::Error> for ImportError {
    fn from(_: serde_json::Error) -> Self {
        Self::Storage
    }
}

impl From<SourceError> for ImportError {
    fn from(error: SourceError) -> Self {
        match error {
            SourceError::NotFound => Self::NotFound,
            SourceError::Invalid(_) => Self::Invalid("Invalid source observation"),
            SourceError::Conflict => {
                Self::Conflict("Source ownership changed; stage a new preview")
            }
            SourceError::Db(_) => Self::Storage,
        }
    }
}

impl From<PersonError> for ImportError {
    fn from(error: PersonError) -> Self {
        match error {
            PersonError::NotFound => Self::NotFound,
            PersonError::Retired(_) => Self::Conflict("Identity changed; stage a new preview"),
            PersonError::Invalid(_) => Self::Invalid("Invalid person decision"),
            PersonError::Db(_) => Self::Storage,
        }
    }
}

/// Persist a bounded preview without creating, linking, or editing directory records.
pub async fn stage(pool: &SqlitePool, input: &StageBatchInput) -> Result<ImportBatch, ImportError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let batch = stage_in_transaction(&mut tx, input).await?;
    tx.commit().await?;
    Ok(batch)
}

/// Stage a completed provider scan inside the caller's transaction so its run state
/// and preview become durable together. The caller must commit or roll back.
pub async fn stage_in_transaction(
    conn: &mut SqliteConnection,
    input: &StageBatchInput,
) -> Result<ImportBatch, ImportError> {
    if !valid_key(&input.account_id)
        || !valid_key(&input.collection_key)
        || input.rows.len() > MAX_ROWS
    {
        return Err(ImportError::Invalid(
            "An account, collection and at most 10000 rows are required",
        ));
    }
    let mut size = 0usize;
    let mut counts = HashMap::new();
    for row in &input.rows {
        size = size
            .checked_add(serde_json::to_vec(row)?.len())
            .ok_or(ImportError::Invalid(
                "Import preview exceeds its size limit",
            ))?;
        if size > MAX_PREVIEW_BYTES {
            return Err(ImportError::Invalid(
                "Import preview exceeds its size limit",
            ));
        }
        *counts.entry(row.record_key.as_str()).or_insert(0usize) += 1;
    }
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM source_accounts WHERE id=?1)")
            .bind(&input.account_id)
            .fetch_one(&mut *conn)
            .await?;
    if !exists {
        return Err(ImportError::NotFound);
    }
    let provider: Option<(i64, bool)> =
        sqlx::query_as("SELECT epoch,connected FROM provider_accounts WHERE account_id=?1")
            .bind(&input.account_id)
            .fetch_optional(&mut *conn)
            .await?;
    if provider.is_some_and(|(_, connected)| !connected) {
        return Err(ImportError::Conflict(
            "Provider account disconnected; reconnect and stage a new preview",
        ));
    }
    let mut rows = Vec::with_capacity(input.rows.len());
    for (ordinal, row) in input.rows.iter().enumerate() {
        let mut errors = row.errors.clone();
        if counts
            .get(row.record_key.as_str())
            .copied()
            .unwrap_or_default()
            > 1
        {
            errors.push(RowIssue::DuplicateSourceKey);
        }
        let known = if valid_key(&row.record_key) {
            find_record(
                conn,
                &input.account_id,
                &input.collection_key,
                &row.record_key,
            )
            .await?
        } else {
            errors.push(RowIssue::InvalidRecord);
            None
        };
        if row.removed {
            if known.is_none() || row.payload.is_some() {
                errors.push(RowIssue::InvalidRemoval);
            }
        } else if row.payload.as_ref().is_none_or(|payload| {
            validate_record(&source_input(input, &row.record_key, "preview", payload)).is_err()
        }) {
            errors.push(RowIssue::InvalidRecord);
        }
        let proposal = if !errors.is_empty() {
            RowProposal::Invalid
        } else if row.removed {
            RowProposal::DeactivateSource
        } else if known.is_some() {
            RowProposal::UpdateSource
        } else {
            RowProposal::NewSource
        };
        rows.push(ImportRow {
            id: uuid::Uuid::new_v4().to_string(),
            ordinal: i64::try_from(ordinal)
                .map_err(|_| ImportError::Invalid("Too many import rows"))?,
            record_key: row.record_key.clone(),
            payload: row.payload.clone(),
            removed: row.removed,
            errors,
            proposal,
            source_record_id: known.as_ref().map(|record| record.id.clone()),
            source_revision: known.as_ref().map(|record| record.revision),
            entity_id: known.map(|record| record.entity_id),
            processed: false,
        });
    }
    let batch = ImportBatch {
        id: uuid::Uuid::new_v4().to_string(),
        account_id: input.account_id.clone(),
        collection_key: input.collection_key.clone(),
        source_epoch: provider.map(|(epoch, _)| epoch),
        revision: 1,
        created_at: crate::time::now_rfc3339(),
        rows,
    };
    repo::insert_batch(conn, &batch).await?;
    Ok(batch)
}

/// Read a persisted preview, including rows not selected by earlier partial commits.
pub async fn get(pool: &SqlitePool, id: &str) -> Result<ImportBatch, ImportError> {
    let mut tx = pool.begin().await?;
    let batch = repo::get_batch(&mut tx, id).await?;
    tx.commit().await?;
    Ok(batch)
}

/// Atomically apply explicit pending-row decisions and persist their retry receipt.
/// Existing receipts are checked before preview revision, making exact retries safe.
pub async fn commit(
    pool: &SqlitePool,
    batch_id: &str,
    input: &CommitBatchInput,
) -> Result<CommitReceipt, ImportError> {
    validate_commit(input)?;
    let hash = sha256_hex(&serde_json::to_vec(input)?);
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some((stored_hash, receipt)) =
        repo::get_receipt(&mut tx, batch_id, &input.idempotency_key).await?
    {
        if stored_hash != hash {
            return Err(ImportError::Conflict(
                "The idempotency key was used with a different request",
            ));
        }
        return Ok(receipt);
    }
    let batch = repo::get_batch(&mut tx, batch_id).await?;
    if batch.revision != input.revision {
        return Err(ImportError::Conflict(
            "Preview revision changed; reload the batch",
        ));
    }
    if let Some(epoch) = batch.source_epoch {
        fence_account(&mut tx, &batch.account_id, AccountEpoch(epoch))
            .await
            .map_err(|error| match error {
                ProviderStoreError::StaleAccount => {
                    ImportError::Conflict("Provider account changed; stage a new preview")
                }
                _ => ImportError::Storage,
            })?;
    } else {
        let provider_registered: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM provider_accounts WHERE account_id=?1)",
        )
        .bind(&batch.account_id)
        .fetch_one(&mut *tx)
        .await?;
        if provider_registered {
            return Err(ImportError::Conflict(
                "Provider account changed; stage a new preview",
            ));
        }
    }
    let rows: HashMap<&str, &ImportRow> = batch
        .rows
        .iter()
        .map(|row| (row.id.as_str(), row))
        .collect();
    for decision in &input.decisions {
        let row = rows
            .get(decision.row_id.as_str())
            .ok_or(ImportError::Invalid(
                "A selected row does not belong to this batch",
            ))?;
        validate_decision(&mut tx, &batch, row, &decision.action).await?;
    }
    let mut committed = Vec::with_capacity(input.decisions.len());
    for decision in &input.decisions {
        let row = rows
            .get(decision.row_id.as_str())
            .ok_or(ImportError::Invalid(
                "A selected row does not belong to this batch",
            ))?;
        committed.push(apply_decision(&mut tx, &batch, row, &decision.action).await?);
    }
    let receipt = CommitReceipt {
        batch_id: batch.id,
        revision: batch.revision.checked_add(1).ok_or(ImportError::Storage)?,
        rows: committed,
    };
    repo::finish_commit(&mut tx, &input.idempotency_key, &hash, &receipt).await?;
    tx.commit().await?;
    Ok(receipt)
}

fn valid_key(key: &str) -> bool {
    !key.trim().is_empty() && key.len() <= 1024
}

fn source_input(
    batch: &StageBatchInput,
    key: &str,
    entity_id: &str,
    payload: &ImportPayload,
) -> SourceRecordInput {
    SourceRecordInput {
        account_id: batch.account_id.clone(),
        collection_key: batch.collection_key.clone(),
        record_key: key.to_string(),
        entity_id: entity_id.to_string(),
        display_name: payload.display_name.clone(),
        name: payload.name.clone(),
        points: payload.points.clone(),
    }
}

fn validate_commit(input: &CommitBatchInput) -> Result<(), ImportError> {
    if input.revision < 1
        || input.idempotency_key.trim().is_empty()
        || input.idempotency_key.len() > 128
        || input.decisions.is_empty()
        || input.decisions.len() > MAX_ROWS
    {
        return Err(ImportError::Invalid(
            "A revision, idempotency key and 1–10000 decisions are required",
        ));
    }
    let mut seen = HashSet::new();
    for decision in &input.decisions {
        if !valid_key(&decision.row_id)
            || matches!(&decision.action, RowAction::LinkPerson { entity_id } if !valid_key(entity_id))
        {
            return Err(ImportError::Invalid(
                "Selected row and person identifiers must be nonempty and bounded",
            ));
        }
        if !seen.insert(&decision.row_id) {
            return Err(ImportError::Invalid("A row may only be selected once"));
        }
    }
    Ok(())
}

async fn validate_decision(
    conn: &mut SqliteConnection,
    batch: &ImportBatch,
    row: &ImportRow,
    action: &RowAction,
) -> Result<(), ImportError> {
    if row.processed {
        return Err(ImportError::Conflict(
            "A selected row was already processed",
        ));
    }
    if matches!(action, RowAction::Skip) {
        return Ok(());
    }
    if !row.errors.is_empty() {
        return Err(ImportError::Invalid("A selected row has validation errors"));
    }
    let current = find_record(
        conn,
        &batch.account_id,
        &batch.collection_key,
        &row.record_key,
    )
    .await?;
    if current.as_ref().map(|record| (&record.id, record.revision))
        != row.source_record_id.as_ref().zip(row.source_revision)
    {
        return Err(ImportError::Conflict(
            "Source changed after preview; stage a new batch",
        ));
    }
    match action {
        RowAction::CreatePerson if current.is_none() && !row.removed => {
            if row
                .payload
                .as_ref()
                .and_then(|payload| payload.display_name.as_ref())
                .is_none_or(|name| name.trim().is_empty())
            {
                return Err(ImportError::Invalid(
                    "Creating a person requires a display name",
                ));
            }
        }
        RowAction::LinkPerson { entity_id } if current.is_none() && !row.removed => {
            crate::persons::repo::require_person(conn, entity_id).await?;
        }
        RowAction::UpdateSource if current.is_some() && !row.removed => {}
        RowAction::DeactivateSource if current.is_some() && row.removed => {}
        _ => {
            return Err(ImportError::Invalid(
                "The selected action does not match the source proposal",
            ))
        }
    }
    Ok(())
}

async fn apply_decision(
    conn: &mut SqliteConnection,
    batch: &ImportBatch,
    row: &ImportRow,
    action: &RowAction,
) -> Result<CommittedRow, ImportError> {
    if matches!(action, RowAction::Skip) {
        return Ok(CommittedRow {
            row_id: row.id.clone(),
            entity_id: None,
            source_record_id: None,
            skipped: true,
        });
    }
    if matches!(action, RowAction::DeactivateSource) {
        let id = row.source_record_id.as_ref().ok_or(ImportError::Storage)?;
        deactivate_record(conn, id).await?;
        return Ok(CommittedRow {
            row_id: row.id.clone(),
            entity_id: row.entity_id.clone(),
            source_record_id: Some(id.clone()),
            skipped: false,
        });
    }
    let payload = row.payload.as_ref().ok_or(ImportError::Storage)?;
    let entity_id = match action {
        RowAction::CreatePerson => {
            create_person(
                conn,
                payload
                    .display_name
                    .as_deref()
                    .ok_or(ImportError::Storage)?,
            )
            .await?
        }
        RowAction::LinkPerson { entity_id } => entity_id.clone(),
        RowAction::UpdateSource => row.entity_id.clone().ok_or(ImportError::Storage)?,
        _ => return Err(ImportError::Storage),
    };
    let record: SourceRecord = apply_record(
        conn,
        &SourceRecordInput {
            account_id: batch.account_id.clone(),
            collection_key: batch.collection_key.clone(),
            record_key: row.record_key.clone(),
            entity_id,
            display_name: payload.display_name.clone(),
            name: payload.name.clone(),
            points: payload.points.clone(),
        },
    )
    .await?;
    Ok(CommittedRow {
        row_id: row.id.clone(),
        entity_id: Some(record.entity_id),
        source_record_id: Some(record.id),
        skipped: false,
    })
}
