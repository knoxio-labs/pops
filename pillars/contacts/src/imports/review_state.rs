//! Row ingestion bindings are independent of whether every candidate has been reviewed.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;
use utoipa::ToSchema;

use super::service::ImportError;
use crate::sources::model::SourceRecord;

/// The last explicit decision about a stable candidate identity for an import row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum CandidateDecision {
    Merged,
    Different,
    Later,
}

/// An optional ingestion binding plus candidate decisions. The source owner remains
/// its original stable entity ID even when a later merge changes its canonical group.
/// Audit IDs may outlive an unmerged person or source; consumers must revalidate them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRowState {
    pub row_id: String,
    pub entity_id: Option<String>,
    pub source_record_id: Option<String>,
    pub source_revision: Option<i64>,
    pub decisions: BTreeMap<String, CandidateDecision>,
}

#[derive(sqlx::FromRow)]
struct StoredState {
    row_id: String,
    entity_id: Option<String>,
    source_record_id: Option<String>,
    source_revision: Option<i64>,
    decisions: String,
}

fn decode(row: StoredState) -> Result<ReviewRowState, ImportError> {
    Ok(ReviewRowState {
        row_id: row.row_id,
        entity_id: row.entity_id,
        source_record_id: row.source_record_id,
        source_revision: row.source_revision,
        decisions: serde_json::from_str(&row.decisions)?,
    })
}

/// Read durable row state inside the caller's consistent snapshot or write transaction.
pub async fn get(
    conn: &mut SqliteConnection,
    row_id: &str,
) -> Result<Option<ReviewRowState>, ImportError> {
    let row: Option<StoredState> = sqlx::query_as("SELECT row_id,entity_id,source_record_id,source_revision,decisions FROM contact_import_review_states WHERE row_id=?1")
        .bind(row_id).fetch_optional(conn).await?;
    row.map(decode).transpose()
}

/// Read all row bindings in one batch query, avoiding a query for every preview row.
pub async fn get_batch(
    conn: &mut SqliteConnection,
    batch_id: &str,
) -> Result<BTreeMap<String, ReviewRowState>, ImportError> {
    let rows: Vec<StoredState> = sqlx::query_as("SELECT s.row_id,s.entity_id,s.source_record_id,s.source_revision,s.decisions FROM contact_import_review_states s JOIN contact_import_rows r ON r.id=s.row_id WHERE r.batch_id=?1 ORDER BY r.ordinal")
        .bind(batch_id).fetch_all(conn).await?;
    rows.into_iter()
        .map(|row| {
            let state = decode(row)?;
            Ok((state.row_id.clone(), state))
        })
        .collect()
}

/// Bind a successfully applied source observation without discarding prior candidate decisions.
pub async fn bind(
    conn: &mut SqliteConnection,
    row_id: &str,
    record: &SourceRecord,
) -> Result<(), ImportError> {
    sqlx::query("INSERT INTO contact_import_review_states(row_id,entity_id,source_record_id,source_revision) VALUES(?1,?2,?3,?4) ON CONFLICT(row_id) DO UPDATE SET entity_id=excluded.entity_id,source_record_id=excluded.source_record_id,source_revision=excluded.source_revision")
        .bind(row_id).bind(&record.entity_id).bind(&record.id).bind(record.revision).execute(conn).await?;
    Ok(())
}

/// Persist explicit and deferred candidate decisions while preserving any ingestion binding.
pub async fn save_decisions(
    conn: &mut SqliteConnection,
    row_id: &str,
    decisions: &BTreeMap<String, CandidateDecision>,
) -> Result<(), ImportError> {
    sqlx::query("INSERT INTO contact_import_review_states(row_id,decisions) VALUES(?1,?2) ON CONFLICT(row_id) DO UPDATE SET decisions=excluded.decisions")
        .bind(row_id).bind(serde_json::to_string(decisions)?).execute(conn).await?;
    Ok(())
}
