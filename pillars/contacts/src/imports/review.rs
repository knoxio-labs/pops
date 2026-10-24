//! Complete-snapshot classification with bounded wire evidence and unpaged mutation authorization.

mod directory;
mod projection;
mod records;
mod row;

use sqlx::{SqliteConnection, SqlitePool};

use super::model::ImportBatch;
use super::review_model::{ImportReview, ProposalReason, ReviewClassification, ReviewQuery};
use super::service::ImportError;
use crate::identity::IdentityCandidate;

/// Loaded once inside the caller's transaction; classification and authorization never open another one.
pub struct ReviewSnapshot {
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub proposal_revision: String,
    batch: ImportBatch,
    directory: directory::Directory,
    rows: Vec<row::PreparedRow>,
    candidates: Vec<IdentityCandidate>,
}

/// Complete real-target authorization for one row, independent of any evidence page the user viewed.
pub struct ReviewAuthorization {
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub proposal_revision: String,
    pub stale_source: bool,
    pub entity_id: Option<String>,
    pub owner_entity_id: Option<String>,
    pub source_record_id: Option<String>,
    pub classification: ReviewClassification,
    pub reason: ProposalReason,
    pub pending_row_ids: Vec<String>,
    pub blocked_entity_ids: Vec<String>,
    candidate_entity_ids: Vec<String>,
}

impl ReviewAuthorization {
    /// All current canonical candidate IDs, including those absent from a bounded response page.
    pub fn candidate_ids(&self) -> impl Iterator<Item = &str> {
        self.candidate_entity_ids.iter().map(String::as_str)
    }
}

impl ReviewSnapshot {
    /// Derives complete candidate authorization without expanding contact points or source evidence.
    pub fn authorize(&self, row_id: &str) -> Result<ReviewAuthorization, ImportError> {
        let row = self
            .rows
            .iter()
            .find(|row| row.row.id == row_id)
            .ok_or(ImportError::NotFound)?;
        let plan = projection::plan(self, row);
        let mut candidate_entity_ids = Vec::new();
        let mut pending_row_ids = Vec::new();
        let mut blocked_entity_ids = Vec::new();
        for id in &plan.candidate_ids {
            if let Some(group) = self.directory.groups.get(id) {
                if self
                    .directory
                    .separated(row.member_ids(), &group.member_ids)
                {
                    blocked_entity_ids.push(id.clone());
                }
                candidate_entity_ids.push(id.clone());
            } else {
                pending_row_ids.push(id.clone());
            }
        }
        Ok(ReviewAuthorization {
            batch_revision: self.batch_revision,
            directory_revision: self.directory_revision,
            proposal_revision: row.revision(&self.proposal_revision)?,
            stale_source: row.stale_source,
            entity_id: row.entity_id.clone(),
            owner_entity_id: row.owner_entity_id.clone(),
            source_record_id: row.source_record_id.clone(),
            classification: plan.classification,
            reason: plan.reason,
            pending_row_ids,
            blocked_entity_ids,
            candidate_entity_ids,
        })
    }
}

/// Reads a stable review page; every incoming row is classified against all directory and batch evidence.
pub async fn get(
    pool: &SqlitePool,
    batch_id: &str,
    query: &ReviewQuery,
) -> Result<ImportReview, ImportError> {
    let mut tx = pool.begin().await?;
    let snapshot = snapshot(&mut tx, batch_id).await?;
    let page = projection::page(&snapshot, query)?;
    tx.commit().await?;
    Ok(page)
}

/// Loads all eligible evidence after reading the directory revision first in the existing transaction.
/// Composite mutations call `authorize` before writing and compare both revisions plus the row proof.
pub async fn snapshot(
    conn: &mut SqliteConnection,
    batch_id: &str,
) -> Result<ReviewSnapshot, ImportError> {
    let directory_revision = crate::merges::repo::revision(conn).await?;
    let batch = super::repo::get_batch(conn, batch_id).await?;
    let states = super::review_state::get_batch(conn, batch_id).await?;
    let directory = directory::Directory::load(conn).await?;
    let provider: Option<(i64, bool)> =
        sqlx::query_as("SELECT epoch,connected FROM provider_accounts WHERE account_id=?1")
            .bind(&batch.account_id)
            .fetch_optional(&mut *conn)
            .await?;
    let source_stale = match (batch.source_epoch, provider) {
        (Some(expected), Some((current, true))) => expected != current,
        (None, None) => false,
        _ => true,
    };
    let proposal_revision = crate::digest::sha256_hex(&serde_json::to_vec(&(
        &batch,
        directory_revision,
        &states,
        provider,
    ))?);
    let rows = batch
        .rows
        .iter()
        .map(|row| {
            row::PreparedRow::new(
                row.clone(),
                states.get(&row.id).cloned(),
                &batch,
                &directory,
                source_stale,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut candidates: Vec<_> = directory
        .groups
        .values()
        .map(directory::Group::engine_candidate)
        .collect();
    candidates.extend(rows.iter().filter_map(row::PreparedRow::engine_candidate));
    Ok(ReviewSnapshot {
        batch_revision: batch.revision,
        directory_revision,
        proposal_revision,
        batch,
        directory,
        rows,
        candidates,
    })
}
