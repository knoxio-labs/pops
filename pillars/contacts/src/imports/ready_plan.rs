//! Derive ready actions from complete directory/current-batch/external pending evidence.

use sqlx::SqliteConnection;

use super::model::{ImportBatch, ImportRow, RowAction, RowProposal};
use super::ready_model::ReadySummary;
use super::review::{ReviewAuthorization, ReviewSnapshot};
use super::review_model::{ProposalReason, ReviewClassification};
use super::service::ImportError;

pub(crate) const MAX_EXPANDED_WRITES: usize = 250_000;
const MAX_EXTERNAL_ROWS: i64 = 10_000;
const MAX_EXTERNAL_BATCHES: usize = 100;

pub(crate) enum ReadyAction {
    Person { target: Option<String> },
    Source(RowAction),
}

pub(crate) struct ReadyRow {
    pub row_id: String,
    pub action: ReadyAction,
    pub authorization: ReviewAuthorization,
}

pub(crate) struct ReadyPlan {
    pub batch: ImportBatch,
    pub directory_revision: i64,
    pub summary: ReadySummary,
    pub rows: Vec<ReadyRow>,
    pub expanded_writes: usize,
}

pub(crate) async fn load(
    conn: &mut SqliteConnection,
    batch_id: &str,
) -> Result<ReadyPlan, ImportError> {
    let mut snapshot = super::review::snapshot(conn, batch_id).await?;
    let pending_epoch: i64 =
        sqlx::query_scalar("SELECT revision FROM contact_import_ready_epoch WHERE singleton=1")
            .fetch_one(&mut *conn)
            .await?;
    let complete = include_external(conn, &mut snapshot, batch_id).await?;
    let batch = snapshot.batch().clone();
    let states = super::review_state::get_batch(conn, batch_id).await?;
    let scan_valid = match crate::providers::sync::validate_batch(conn, batch_id).await {
        Ok(()) => true,
        Err(crate::providers::store::ProviderStoreError::StaleAccount) => false,
        Err(_) => return Err(ImportError::Storage),
    };
    let mut summary = ReadySummary::default();
    let mut rows = Vec::new();
    let mut expanded_writes = 0usize;
    for row in &batch.rows {
        if row.processed {
            summary.already_processed += 1;
            continue;
        }
        if states.contains_key(&row.id) {
            summary.deferred += 1;
            continue;
        }
        let authorization = snapshot.authorize(&row.id)?;
        let action = if complete && scan_valid {
            eligible(row, &authorization)
        } else {
            None
        };
        let Some(action) = action else {
            summary.review_required += 1;
            continue;
        };
        match &action {
            ReadyAction::Person { target: Some(_) } => summary.automatic_merges += 1,
            ReadyAction::Person { target: None } => summary.new_people += 1,
            ReadyAction::Source(RowAction::UpdateSource) => summary.source_updates += 1,
            ReadyAction::Source(RowAction::DeactivateSource) => summary.source_removals += 1,
            ReadyAction::Source(_) => return Err(ImportError::Storage),
        }
        expanded_writes = expanded_writes
            .checked_add(write_budget(conn, row, &action).await?)
            .ok_or(ImportError::Storage)?;
        rows.push(ReadyRow {
            row_id: row.id.clone(),
            action,
            authorization,
        });
    }
    summary.eligible_rows = rows.len();
    summary.proposal_revision = crate::digest::sha256_hex(&serde_json::to_vec(&(
        &snapshot.proposal_revision,
        pending_epoch,
        complete,
        &summary,
    ))?);
    Ok(ReadyPlan {
        batch,
        directory_revision: snapshot.directory_revision,
        summary,
        rows,
        expanded_writes,
    })
}

async fn include_external(
    conn: &mut SqliteConnection,
    snapshot: &mut ReviewSnapshot,
    batch_id: &str,
) -> Result<bool, ImportError> {
    let pending: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM contact_import_rows WHERE batch_id<>?1 AND processed=0",
    )
    .bind(batch_id)
    .fetch_one(&mut *conn)
    .await?;
    if pending > MAX_EXTERNAL_ROWS {
        return Ok(false);
    }
    let ids: Vec<String> = sqlx::query_scalar("SELECT DISTINCT batch_id FROM contact_import_rows WHERE batch_id<>?1 AND processed=0 ORDER BY batch_id LIMIT 101").bind(batch_id).fetch_all(&mut *conn).await?;
    if ids.len() > MAX_EXTERNAL_BATCHES {
        return Ok(false);
    }
    for id in ids {
        let batch = super::repo::get_batch(conn, &id).await?;
        let states = super::review_state::get_batch(conn, &id).await?;
        snapshot.include_pending_batch(&batch, &states)?;
    }
    Ok(true)
}

fn eligible(row: &ImportRow, authorization: &ReviewAuthorization) -> Option<ReadyAction> {
    if authorization.stale_source
        || !row.errors.is_empty()
        || !authorization.pending_row_ids.is_empty()
        || !authorization.blocked_entity_ids.is_empty()
    {
        return None;
    }
    if matches!(row.proposal, RowProposal::NewSource)
        && row
            .payload
            .as_ref()
            .and_then(|payload| payload.display_name.as_ref())
            .is_none_or(|name| name.trim().is_empty())
    {
        return None;
    }
    match (
        &row.proposal,
        authorization.classification,
        authorization.reason,
    ) {
        (RowProposal::NewSource, ReviewClassification::New, ProposalReason::NewPerson)
            if authorization.source_record_id.is_none()
                && row
                    .payload
                    .as_ref()?
                    .display_name
                    .as_ref()
                    .is_some_and(|name| !name.trim().is_empty()) =>
        {
            Some(ReadyAction::Person { target: None })
        }
        (
            RowProposal::NewSource,
            ReviewClassification::Automatic,
            ProposalReason::Email | ProposalReason::Phone | ProposalReason::CompleteName,
        ) if authorization.source_record_id.is_none() => {
            let mut ids = authorization.candidate_ids();
            let target = ids.next()?.to_owned();
            if ids.next().is_some() {
                return None;
            }
            Some(ReadyAction::Person {
                target: Some(target),
            })
        }
        (
            RowProposal::UpdateSource,
            ReviewClassification::Automatic,
            ProposalReason::SourceIdentity,
        ) if authorization.source_record_id.is_some() => {
            Some(ReadyAction::Source(RowAction::UpdateSource))
        }
        (
            RowProposal::DeactivateSource,
            ReviewClassification::Automatic,
            ProposalReason::SourceRemoval,
        ) if authorization.source_record_id.is_some() => {
            Some(ReadyAction::Source(RowAction::DeactivateSource))
        }
        _ => None,
    }
}

async fn write_budget(
    conn: &mut SqliteConnection,
    row: &ImportRow,
    action: &ReadyAction,
) -> Result<usize, ImportError> {
    let mut budget = 24
        + row
            .payload
            .as_ref()
            .map_or(0, |payload| payload.points.len() * 2);
    if let Some(source) = &row.source_record_id {
        let points: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM contact_points WHERE source_record_id=?1 AND active=1",
        )
        .bind(source)
        .fetch_one(&mut *conn)
        .await?;
        budget += usize::try_from(points).map_err(|_| ImportError::Storage)?;
    }
    if let ReadyAction::Person {
        target: Some(target),
    } = action
    {
        budget += crate::merges::repo::members(conn, target).await?.len() * 2;
    }
    Ok(budget)
}
