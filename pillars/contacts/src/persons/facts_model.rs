//! Atomic local fact decisions and their guarded undo contract.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::model::{ContactPoint, ContactPointInput};
use crate::entities::{
    addresses_model::{Address, CreateAddressBody},
    model::Entity,
};

/// One explicit draft change. Point and address identifiers name exact observations, never matching text.
/// `setEntity` replaces both display name and notes; omitted or null notes clear that field.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum FactChange {
    SetEntity {
        name: String,
        notes: Option<String>,
    },
    AddPoint {
        point: ContactPointInput,
    },
    EditPoint {
        #[serde(rename = "pointId")]
        point_id: String,
        point: ContactPointInput,
    },
    RemovePoint {
        #[serde(rename = "pointId")]
        point_id: String,
    },
    AddAddress {
        address: CreateAddressBody,
    },
    EditAddress {
        #[serde(rename = "addressId")]
        address_id: String,
        address: CreateAddressBody,
    },
    RemoveAddress {
        #[serde(rename = "addressId")]
        address_id: String,
    },
}

/// Apply the complete explicit draft atomically at the exact snapshot version; retries reuse the key and body.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FactChangeBody {
    pub expected_version: i64,
    pub idempotency_key: String,
    pub changes: Vec<FactChange>,
}

/// Undo one operation at a freshly read version, only while it still owns all decisions and preferences it changed.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FactUndoBody {
    pub expected_version: i64,
    pub idempotency_key: String,
}

/// Immutable operation identity; undo appends another operation rather than modifying history.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FactOperation {
    pub id: String,
    pub undone_operation_id: Option<String>,
    pub created_at: String,
    pub can_undo: bool,
}

/// An atomic canonical projection and its optimistic version, including persisted operation history.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct FactsSnapshot {
    pub version: i64,
    pub entity: Entity,
    pub points: Vec<ContactPoint>,
    pub addresses: Vec<Address>,
    pub operations: Vec<FactOperation>,
}

/// Read envelope for a coherent person fact snapshot.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct FactsResponse {
    pub data: FactsSnapshot,
}

/// Successful mutation receipt. Identical retries return this original snapshot, even after later changes.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct FactReceipt {
    pub data: FactsSnapshot,
    pub operation: FactOperationReceipt,
}

/// The operation appended by a write, with the original operation identity on undo.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FactOperationReceipt {
    pub id: String,
    pub undone_operation_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum DecisionValue {
    Hidden,
    Point {
        id: String,
    },
    Address {
        value: String,
        label: Option<String>,
        city: Option<String>,
    },
    Entity {
        name: String,
        notes: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, sqlx::FromRow)]
pub(crate) struct Decision {
    pub entity_id: String,
    pub target: String,
    pub operation_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct DecisionEvidence {
    pub target: String,
    pub before: Option<Decision>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct SelectionEvidence {
    pub field: String,
    pub before: Option<crate::merges::model::SelectionRow>,
    pub before_owner: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub(crate) struct Evidence {
    pub changes: Vec<FactChange>,
    pub decisions: Vec<DecisionEvidence>,
    pub selections: Vec<SelectionEvidence>,
}
