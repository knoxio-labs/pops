//! Atomic per-row review decisions bind an import to an explicit candidate subset.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::merges::model::{FieldSelection, SourceMergeField};

/// A fresh row proposal and explicit candidate choices. Omitted candidates remain pending.
/// Empty candidate lists explicitly ingest the row without declaring candidate identity.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewDecisionInput {
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub proposal_revision: String,
    pub row_id: String,
    pub idempotency_key: String,
    #[serde(default)]
    pub merge_entity_ids: Vec<String>,
    #[serde(default)]
    pub different_entity_ids: Vec<String>,
    #[serde(default)]
    pub later_entity_ids: Vec<String>,
    #[serde(default)]
    pub selections: Vec<FieldSelection>,
    #[serde(default)]
    pub preferred_point_ids: Vec<String>,
    /// Explicit replacements from this row's validated immutable source observation.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub incoming_fields: Vec<SourceMergeField>,
}

/// Immutable receipt for the entire reviewed action, including ingestion, decisions and subset merge.
/// A pure defer can leave entityId null. Pending candidates stay independently reviewable.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDecisionReceipt {
    pub batch_id: String,
    pub row_id: String,
    pub batch_revision: i64,
    pub directory_revision: i64,
    #[schema(required = true)]
    pub entity_id: Option<String>,
    #[schema(required = true)]
    pub operation_id: Option<String>,
    pub pending_entity_ids: Vec<String>,
    pub processed: bool,
}
