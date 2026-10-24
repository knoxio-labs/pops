//! Server-derived candidate evidence and optimistic import-review proposals.

use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use super::model::{ImportPayload, RowIssue, RowProposal};
use crate::persons::model::{PersonName, PersonProfile};

pub use super::review_state::CandidateDecision;

/// One coherent read of a durable import batch and the complete eligible directory.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportReview {
    pub batch_id: String,
    pub batch_revision: i64,
    pub directory_revision: i64,
    pub proposal_revision: String,
    pub source: ReviewSource,
    pub total_rows: usize,
    pub offset: usize,
    pub limit: usize,
    pub counts: ReviewCounts,
    pub rows: Vec<ReviewRow>,
}

/// Complete-batch classification totals, independent of either evidence page.
#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct ReviewCounts {
    pub automatic: usize,
    pub review: usize,
    pub new: usize,
    pub invalid: usize,
}

/// Page selection never narrows the identity evidence used for classification or authorization.
#[derive(Debug, Clone, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[into_params(parameter_in = Query, rename_all = "camelCase")]
pub struct ReviewQuery {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub limit: usize,
    pub candidate_row_id: Option<String>,
    #[serde(default)]
    pub candidate_offset: usize,
    #[serde(default = "default_page_size")]
    pub candidate_limit: usize,
    pub proposal_revision: Option<String>,
}

fn default_page_size() -> usize {
    50
}

impl Default for ReviewQuery {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
            candidate_row_id: None,
            candidate_offset: 0,
            candidate_limit: 50,
            proposal_revision: None,
        }
    }
}

/// A staged observation with real evidence and an opaque revision for this exact proposal.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRow {
    pub row_id: String,
    #[schema(required = true)]
    pub incoming: Option<ImportPayload>,
    pub processed: bool,
    #[schema(required = true)]
    pub entity_id: Option<String>,
    #[schema(required = true)]
    pub owner_entity_id: Option<String>,
    #[schema(required = true)]
    pub source_record_id: Option<String>,
    pub proposal: RowProposal,
    pub errors: Vec<RowIssue>,
    pub classification: ReviewClassification,
    pub reason: ProposalReason,
    pub proposal_revision: String,
    pub stale_source: bool,
    pub decisions: std::collections::BTreeMap<String, CandidateDecision>,
    pub candidate_total: usize,
    pub candidate_offset: usize,
    pub candidate_limit: usize,
    pub candidates_truncated: bool,
    pub candidates: Vec<ReviewCandidate>,
}

impl ReviewRow {
    /// Current canonical person candidates authorized by this snapshot; staged row IDs are excluded.
    pub fn candidate_ids(&self) -> impl Iterator<Item = &str> {
        self.candidates
            .iter()
            .filter_map(|candidate| candidate.entity_id.as_deref())
    }
}

/// Whether evidence permits an automatic match, requires a decision, or identifies a new person.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReviewClassification {
    Automatic,
    Review,
    New,
}

/// Stable machine-readable explanations; display-only names never supply complete-name evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProposalReason {
    SourceIdentity,
    Email,
    Phone,
    CompleteName,
    NewPerson,
    ConflictingSourceBindings,
    SharedIdentifier,
    ConflictingSignals,
    AmbiguousName,
    IncompleteName,
    KeepSeparate,
    BatchCollision,
    BatchMatch,
    InvalidRecord,
    StaleSource,
    SourceRemoval,
}

/// A real canonical person or persisted incoming row, never a fabricated person identity.
/// Exactly one of `entityId` and `rowId` is populated; row targets cannot be merged yet.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCandidate {
    #[schema(required = true)]
    pub entity_id: Option<String>,
    #[schema(required = true)]
    pub row_id: Option<String>,
    pub member_ids: Vec<String>,
    pub name: String,
    pub local_name: String,
    #[schema(required = true)]
    pub person_profile: Option<PersonProfile>,
    #[schema(required = true)]
    pub local_person_profile: Option<PersonProfile>,
    pub points: Vec<ReviewPoint>,
    pub sources: Vec<ReviewSource>,
    pub reasons: Vec<ProposalReason>,
    pub keep_separate: bool,
}

/// A retained original point or unmaterialized import observation; original values stay intact.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPoint {
    #[schema(required = true)]
    pub id: Option<String>,
    #[schema(required = true)]
    pub owner_entity_id: Option<String>,
    pub kind: String,
    pub value: String,
    #[schema(required = true)]
    pub normalized_value: Option<String>,
    #[schema(required = true)]
    pub label: Option<String>,
    #[schema(required = true)]
    pub country_code: Option<String>,
    #[schema(required = true)]
    pub source_record_id: Option<String>,
    pub active: bool,
    pub preferred: bool,
}

/// Credential-free source provenance, retaining the original owner of merged observations.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSource {
    #[schema(required = true)]
    pub id: Option<String>,
    pub account_id: String,
    #[schema(required = true)]
    pub owner_entity_id: Option<String>,
    pub provider: String,
    #[schema(required = true)]
    pub label: Option<String>,
    #[schema(required = true)]
    pub display_name: Option<String>,
    pub name: PersonName,
    pub active: bool,
    #[schema(required = true)]
    pub revision: Option<i64>,
}
