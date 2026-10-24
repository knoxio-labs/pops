//! Durable import previews and explicit row decisions shared by files and providers.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::persons::model::{ContactPointInput, NameCompleteness, PersonName};

/// Source observations to propose; staging never changes the canonical directory.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportPayload {
    pub display_name: Option<String>,
    pub name: PersonName,
    pub points: Vec<ContactPointInput>,
}

/// Qualify unknown source-name completeness using explicit nonblank given and family parts.
/// Declared completeness and every original part are retained; display text is never inspected.
pub fn qualify_structured_name(mut name: PersonName) -> PersonName {
    if name.completeness == NameCompleteness::Unknown
        && name
            .given_name
            .as_deref()
            .is_some_and(|given| !given.trim().is_empty())
        && name
            .family_name
            .as_deref()
            .is_some_and(|family| !family.trim().is_empty())
    {
        name.completeness = NameCompleteness::Complete;
    }
    name
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

#[cfg(test)]
mod tests {
    use super::qualify_structured_name;
    use crate::persons::model::{NameCompleteness, PersonName};

    #[test]
    fn explicit_given_and_family_qualify_without_modifying_original_parts() {
        let name = qualify_structured_name(PersonName {
            given_name: Some(" Rosane ".into()),
            additional_names: Some("Maria".into()),
            family_name: Some(" Menegotto ".into()),
            name_prefix: Some("Dr.".into()),
            name_suffix: Some("Jr.".into()),
            ..PersonName::default()
        });
        assert_eq!(name.completeness, NameCompleteness::Complete);
        assert_eq!(name.given_name.as_deref(), Some(" Rosane "));
        assert_eq!(name.additional_names.as_deref(), Some("Maria"));
        assert_eq!(name.family_name.as_deref(), Some(" Menegotto "));
        assert_eq!(name.name_prefix.as_deref(), Some("Dr."));
        assert_eq!(name.name_suffix.as_deref(), Some("Jr."));
    }

    #[test]
    fn missing_or_blank_parts_and_multiword_given_only_are_not_complete() {
        for (given, family) in [
            (Some("Rosane Menegotto"), None),
            (Some("Rosane"), Some("  ")),
            (None, Some("Menegotto")),
            (Some("  "), Some("Menegotto")),
            (None, None),
        ] {
            let name = qualify_structured_name(PersonName {
                given_name: given.map(str::to_owned),
                family_name: family.map(str::to_owned),
                ..PersonName::default()
            });
            assert_eq!(name.completeness, NameCompleteness::Unknown);
        }
    }

    #[test]
    fn declared_incomplete_metadata_is_not_promoted() {
        let name = qualify_structured_name(PersonName {
            given_name: Some("Rosane".into()),
            family_name: Some("Menegotto".into()),
            completeness: NameCompleteness::Incomplete,
            ..PersonName::default()
        });
        assert_eq!(name.completeness, NameCompleteness::Incomplete);
    }
}
