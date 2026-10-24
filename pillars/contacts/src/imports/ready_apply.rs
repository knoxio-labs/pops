//! Apply only preauthorized rows under the batch caller's reserved SQLite transaction.

use sqlx::SqliteConnection;

use super::ready_model::ReadyBatchReceipt;
use super::ready_plan::{ReadyAction, ReadyPlan};
use super::review_decision_model::{ReviewDecisionInput, ReviewDecisionReceipt};
use super::service::{self, ImportError};

pub(crate) async fn apply(
    conn: &mut SqliteConnection,
    plan: ReadyPlan,
    hash: &str,
) -> Result<ReadyBatchReceipt, ImportError> {
    let mut rows = Vec::with_capacity(plan.rows.len());
    for selected in plan.rows {
        let row = plan
            .batch
            .rows
            .iter()
            .find(|row| row.id == selected.row_id)
            .ok_or(ImportError::Storage)?;
        let receipt = match selected.action {
            ReadyAction::Person { target } => {
                let input = ReviewDecisionInput {
                    batch_revision: selected.authorization.batch_revision,
                    directory_revision: selected.authorization.directory_revision,
                    proposal_revision: selected.authorization.proposal_revision.clone(),
                    row_id: selected.row_id.clone(),
                    idempotency_key: format!("ready:{hash}:{}", selected.row_id),
                    merge_entity_ids: target.clone().into_iter().collect(),
                    different_entity_ids: Vec::new(),
                    later_entity_ids: Vec::new(),
                    selections: Vec::new(),
                    preferred_point_ids: Vec::new(),
                    incoming_fields: Vec::new(),
                };
                super::review_decision_service::apply_authorized(
                    conn,
                    &plan.batch,
                    selected.authorization,
                    &input,
                    target.as_deref(),
                )
                .await?
            }
            ReadyAction::Source(action) => {
                service::validate_decision(conn, &plan.batch, row, &action).await?;
                let result = service::apply_decision(conn, &plan.batch, row, &action).await?;
                let entity_id = if let Some(owner) = result.entity_id {
                    crate::merges::repo::resolve_one(conn, &owner).await?
                } else {
                    None
                };
                sqlx::query(
                    "UPDATE contact_import_rows SET processed=1 WHERE id=?1 AND batch_id=?2",
                )
                .bind(&selected.row_id)
                .bind(&plan.batch.id)
                .execute(&mut *conn)
                .await?;
                ReviewDecisionReceipt {
                    batch_id: plan.batch.id.clone(),
                    row_id: selected.row_id,
                    batch_revision: plan
                        .batch
                        .revision
                        .checked_add(1)
                        .ok_or(ImportError::Storage)?,
                    directory_revision: crate::merges::repo::revision(conn).await?,
                    entity_id,
                    operation_id: None,
                    pending_entity_ids: Vec::new(),
                    processed: true,
                }
            }
        };
        rows.push(receipt);
    }
    let batch_revision = if rows.is_empty() {
        plan.batch.revision
    } else {
        let revision = plan
            .batch
            .revision
            .checked_add(1)
            .ok_or(ImportError::Storage)?;
        sqlx::query("UPDATE contact_import_batches SET revision=?1 WHERE id=?2")
            .bind(revision)
            .bind(&plan.batch.id)
            .execute(&mut *conn)
            .await?;
        revision
    };
    Ok(ReadyBatchReceipt {
        batch_id: plan.batch.id,
        batch_revision,
        directory_revision: crate::merges::repo::revision(conn).await?,
        rows,
        deferred: plan.summary.deferred,
        review_required: plan.summary.review_required,
        already_processed: plan.summary.already_processed,
    })
}
