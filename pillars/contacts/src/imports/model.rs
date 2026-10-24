//! Durable import previews and explicit row decisions shared by files and providers.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::persons::model::{ContactPointInput, PersonName};

/// Source observations to propose; staging never changes the canonical directory.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportPayload {
    pub display_name: Option<String>,
    pub name: PersonName,
    pub points: Vec<ContactPointInput>,
}

/// Sanitized validation failures retained alongside a preview row.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RowIssue {
    MalformedRecord,
    DuplicateSourceKey,
    InvalidRecord,
    InvalidRemoval,
}

/// One trusted external key and its proposed replacement or removal.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StageRowInput {
    pub record_key: String,
    pub payload: Option<ImportPayload>,
    pub removed: bool,
    pub errors: Vec<RowIssue>,
}

/// An account and collection namespace for a bounded, fully gathered source page set.
#[derive(Debug, Clone)]
pub struct StageBatchInput {
    pub account_id: String,
    pub collection_key: String,
    pub rows: Vec<StageRowInput>,
}

/// The only automatic proposals concern recognized source identity, never similar names.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RowProposal {
    NewSource,
    UpdateSource,
    DeactivateSource,
    Invalid,
}

/// Persisted preview with the source revision that must still match at commit time.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    pub id: String,
    pub ordinal: i64,
    pub record_key: String,
    pub payload: Option<ImportPayload>,
    pub removed: bool,
    pub errors: Vec<RowIssue>,
    pub proposal: RowProposal,
    pub source_record_id: Option<String>,
    pub source_revision: Option<i64>,
    pub entity_id: Option<String>,
    pub processed: bool,
}

/// A durable preview; its revision changes only after a successful selected-row commit.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatch {
    pub id: String,
    pub account_id: String,
    pub collection_key: String,
    pub source_epoch: Option<i64>,
    pub revision: i64,
    pub created_at: String,
    pub rows: Vec<ImportRow>,
}

/// An explicit decision for one pending row; linking never follows display-name similarity.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum RowAction {
    CreatePerson,
    LinkPerson {
        #[serde(rename = "entityId")]
        entity_id: String,
    },
    UpdateSource,
    DeactivateSource,
    Skip,
}

/// One row decision inside an atomic commit request.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RowDecision {
    pub row_id: String,
    #[serde(rename = "decision")]
    pub action: RowAction,
}

/// A selected subset of a preview with optimistic concurrency and retry identity.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitBatchInput {
    pub revision: i64,
    pub idempotency_key: String,
    pub decisions: Vec<RowDecision>,
}

/// The stable result of one selected row, also retained in the retry receipt.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CommittedRow {
    pub row_id: String,
    pub entity_id: Option<String>,
    pub source_record_id: Option<String>,
    pub skipped: bool,
}

/// Persisted receipt returned byte-equivalently on a retry with the same key and body.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CommitReceipt {
    pub batch_id: String,
    pub revision: i64,
    pub rows: Vec<CommittedRow>,
}
