//! Source account and observation contracts. Credentials never enter these DTOs.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::persons::model::{ContactPointInput, PersonName};

/// A provider account identity; `accountKey` is a stable provider subject, never a credential.
#[derive(Debug, Clone, Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SourceAccount {
    pub id: String,
    pub provider: String,
    pub account_key: String,
    pub label: Option<String>,
    pub created_at: String,
}

/// Register a stable account namespace. Changing a display label does not change account identity.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAccountInput {
    pub provider: String,
    pub account_key: String,
    pub label: Option<String>,
}

/// One namespaced external contact record attached to a canonical person entity.
#[derive(Debug, Clone, Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SourceRecord {
    pub id: String,
    pub account_id: String,
    pub collection_key: String,
    pub record_key: String,
    pub entity_id: String,
    pub display_name: Option<String>,
    pub given_name: Option<String>,
    pub additional_names: Option<String>,
    pub family_name: Option<String>,
    pub name_prefix: Option<String>,
    pub name_suffix: Option<String>,
    pub name_completeness: String,
    pub active: bool,
    pub last_seen_at: String,
    pub revision: i64,
}

/// Complete replacement of one source record's observations. Local overrides are not part of it.
/// Callers explicitly choose the target entity; this type never implies automatic name matching.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRecordInput {
    pub account_id: String,
    pub collection_key: String,
    pub record_key: String,
    pub entity_id: String,
    pub display_name: Option<String>,
    #[serde(default)]
    pub name: PersonName,
    #[serde(default)]
    pub points: Vec<ContactPointInput>,
}
