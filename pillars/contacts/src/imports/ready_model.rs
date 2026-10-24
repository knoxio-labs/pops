//! Whole-batch readiness proofs and immutable atomic application receipts.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::review_decision_model::ReviewDecisionReceipt;

/// Apply only server-resolved rows from the exact complete ready snapshot, never client-picked targets.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadyBatchInput {
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub proposal_revision: String,
    pub idempotency_key: String,
}

/// Complete-batch eligibility, independent of row/candidate pagination.
/// This proposalRevision includes pending evidence from other batches and differs from paging proofs.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadySummary {
    pub proposal_revision: String,
    pub eligible_rows: usize,
    pub automatic_merges: usize,
    pub new_people: usize,
    pub source_updates: usize,
    pub source_removals: usize,
    pub deferred: usize,
    pub review_required: usize,
    pub already_processed: usize,
}

/// One transaction's exact retry result. Held/review-required rows and their prior choices stay untouched.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadyBatchReceipt {
    pub batch_id: String,
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub rows: Vec<ReviewDecisionReceipt>,
    pub deferred: usize,
    pub review_required: usize,
    pub already_processed: usize,
}
