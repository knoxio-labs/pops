//! Structured local names and provenance-bearing contact point wire types.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A structured name; completeness is explicit and is never inferred from display text.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersonName {
    pub given_name: Option<String>,
    pub additional_names: Option<String>,
    pub family_name: Option<String>,
    pub name_prefix: Option<String>,
    pub name_suffix: Option<String>,
    #[serde(default)]
    pub completeness: NameCompleteness,
}

/// Whether the source explicitly knows a name to be complete, incomplete, or unknown.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum NameCompleteness {
    #[default]
    Unknown,
    Complete,
    Incomplete,
}

impl NameCompleteness {
    /// Stable SQLite representation shared by profile and source observation rows.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Complete => "complete",
            Self::Incomplete => "incomplete",
        }
    }
}

/// Local name override, independent of imported source names and entity display names.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonProfile {
    pub entity_id: String,
    pub name: PersonName,
    pub updated_at: String,
}

/// A contact point's semantic kind; shared values never identify one person by themselves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ContactPointKind {
    Email,
    Phone,
    Social,
    Url,
}

impl ContactPointKind {
    /// Stable SQLite representation of this contact point kind.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Email => "email",
            Self::Phone => "phone",
            Self::Social => "social",
            Self::Url => "url",
        }
    }
}

/// A local or imported point. `sourceRecordId: null` identifies an explicit local value.
/// Preferred observations survive source refresh/deactivation, including their original value.
#[derive(Debug, Clone, Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContactPoint {
    pub id: String,
    pub entity_id: String,
    pub kind: String,
    pub value: String,
    pub normalized_value: Option<String>,
    pub label: Option<String>,
    /// Explicit ISO country context for national phone normalization; absent never implies a locale.
    pub country_code: Option<String>,
    pub source_record_id: Option<String>,
    pub active: bool,
    pub preferred: bool,
    pub created_at: String,
}

/// A point observation. Normalized match keys are computed by the server, never accepted as input.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContactPointInput {
    pub kind: ContactPointKind,
    pub value: String,
    pub label: Option<String>,
    /// Explicit ISO country context for national phone normalization; absent never implies a locale.
    pub country_code: Option<String>,
}
