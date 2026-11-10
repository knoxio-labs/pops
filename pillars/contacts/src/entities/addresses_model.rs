//! Wire ↔ row mapping for an entity's addresses (ADR-053).
//!
//! One row per branch. Unlike [`super::model::Entity`], there is no
//! CSV/JSON-encoded column here — `value` is stored and served verbatim.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// The wire shape served by `GET`/`POST /entities/:id/addresses`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    pub id: String,
    pub entity_id: String,
    pub value: String,
    pub label: Option<String>,
    /// Literal user-entered city text, independent of Trips place identities.
    pub city: Option<String>,
    pub last_edited_time: String,
}

/// A row as stored in the `entity_addresses` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AddressRow {
    pub id: String,
    pub entity_id: String,
    pub value: String,
    pub label: Option<String>,
    pub city: Option<String>,
    pub last_edited_time: String,
}

impl From<AddressRow> for Address {
    fn from(row: AddressRow) -> Self {
        Address {
            id: row.id,
            entity_id: row.entity_id,
            value: row.value,
            label: row.label,
            city: row.city,
            last_edited_time: row.last_edited_time,
        }
    }
}

/// Body accepted by `POST /entities/:id/addresses`.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
pub struct CreateAddressBody {
    pub value: String,
    pub label: Option<String>,
    /// Literal city text; never parsed from `value` or resolved as a Trips place.
    pub city: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_projects_to_wire_address() {
        let row = AddressRow {
            id: "a1".to_string(),
            entity_id: "e1".to_string(),
            value: "12 Example St".to_string(),
            label: None,
            city: None,
            last_edited_time: "2026-09-22T00:00:00.000Z".to_string(),
        };
        let address: Address = row.into();
        assert_eq!(address.id, "a1");
        assert_eq!(address.entity_id, "e1");
        assert_eq!(address.value, "12 Example St");
    }
}
