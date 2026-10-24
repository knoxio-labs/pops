//! Public identity-resolution and merge transaction contracts.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Bounded IDs to resolve, preserving request order and repeated historical IDs.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveBody {
    pub ids: Vec<String>,
}

/// A historical ID and its current canonical identity; null means the ID does not exist.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedIdentity {
    pub id: String,
    #[schema(required = true)]
    pub canonical_id: Option<String>,
}

/// A consistent directory snapshot. Batches may be combined only at the same revision.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolveResponse {
    pub data: Vec<ResolvedIdentity>,
    pub revision: i64,
}

/// Scalar fields that can select a retained member's value without overwriting it.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, ToSchema, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum MergeField {
    Name,
    Abn,
    Aliases,
    DefaultTransactionType,
    DefaultTags,
    Notes,
    AvatarAssetId,
    PosterAssetId,
    PersonProfile,
}

impl MergeField {
    /// The stable storage key for this projected field.
    pub fn key(self) -> &'static str {
        match self {
            Self::Name => "name",
            Self::Abn => "abn",
            Self::Aliases => "aliases",
            Self::DefaultTransactionType => "defaultTransactionType",
            Self::DefaultTags => "defaultTags",
            Self::Notes => "notes",
            Self::AvatarAssetId => "avatarAssetId",
            Self::PosterAssetId => "posterAssetId",
            Self::PersonProfile => "personProfile",
        }
    }
}

/// Source name fields selectable from an immutable imported observation.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum SourceMergeField {
    Name,
    PersonProfile,
}

impl SourceMergeField {
    /// The corresponding scalar projection field.
    pub fn field(self) -> MergeField {
        match self {
            Self::Name => MergeField::Name,
            Self::PersonProfile => MergeField::PersonProfile,
        }
    }
}

/// Explicit field provenance: a retained entity field or a source record's current immutable observation.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum FieldSelection {
    Entity {
        field: MergeField,
        entity_id: String,
    },
    SourceRecord {
        field: SourceMergeField,
        source_record_id: String,
    },
}

impl FieldSelection {
    /// The scalar field replaced by this selection.
    pub fn field(&self) -> MergeField {
        match self {
            Self::Entity { field, .. } => *field,
            Self::SourceRecord { field, .. } => field.field(),
        }
    }
}

/// Applied selections expose the retained provenance and exact immutable source observation.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AppliedSelection {
    Entity {
        field: MergeField,
        entity_id: String,
    },
    SourceRecord {
        field: SourceMergeField,
        source_record_id: String,
        source_observation_id: String,
    },
    Point {
        point_kind: crate::persons::model::ContactPointKind,
        point_id: String,
    },
}

/// Existing canonical groups to combine; member IDs must name their current roots.
/// Requested selections are validated before any redirect changes, never silently ignored.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MergeBody {
    pub canonical_id: String,
    pub member_ids: Vec<String>,
    pub expected_revision: i64,
    pub idempotency_key: String,
    pub evidence: String,
    #[serde(default)]
    pub selections: Vec<FieldSelection>,
    #[serde(default)]
    pub preferred_point_ids: Vec<String>,
}

/// Undo requires the exact untouched post-merge directory revision.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UndoBody {
    pub expected_revision: i64,
    pub idempotency_key: String,
}

/// Persist or revoke an explicit keep-separate decision for stable member IDs.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeparateBody {
    pub left_id: String,
    pub right_id: String,
    pub keep_separate: bool,
    pub expected_revision: i64,
    pub idempotency_key: String,
    pub evidence: String,
}

/// A canonical group and the directory-wide optimistic revision.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct IdentityGroup {
    pub canonical_id: String,
    pub member_ids: Vec<String>,
    pub revision: i64,
    pub selections: Vec<AppliedSelection>,
    pub members: Vec<GroupMember>,
}

/// Original entity fields and local structured name used as auditable side-by-side merge evidence.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GroupMember {
    pub entity: crate::entities::model::Entity,
    pub person_profile: Option<crate::persons::model::PersonProfile>,
}

/// The immutable result of a merge; retries return this original receipt.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub operation_id: String,
    pub canonical_id: String,
    pub member_ids: Vec<String>,
    pub revision: i64,
}

/// Undo restores directory membership. External references created after the merge remain unchanged.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    pub operation_id: String,
    pub restored_ids: Vec<String>,
    pub revision: i64,
}

/// Result of an explicit separation decision.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeparateResult {
    pub left_id: String,
    pub right_id: String,
    pub keep_separate: bool,
    pub revision: i64,
}

/// A current stable-member pair preventing direct and indirect merges.
#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SeparatePair {
    pub left_id: String,
    pub right_id: String,
}

/// All current separation decisions at a consistent directory revision.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeparateList {
    pub data: Vec<SeparatePair>,
    pub revision: i64,
}

/// Stored selection reference; snapshots preserve ownership through undo.
#[derive(Debug, Clone, Deserialize, Serialize, sqlx::FromRow)]
pub struct SelectionRow {
    pub canonical_id: String,
    pub field: String,
    pub owner_entity_id: Option<String>,
    pub point_id: Option<String>,
    pub source_history_id: Option<String>,
}

/// A retained member's previous redirect, omitted when it was a canonical root.
#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct RedirectRow {
    pub member_id: String,
    pub canonical_id: String,
}
