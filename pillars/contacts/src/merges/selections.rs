//! Validate field provenance and bind mutable source IDs to immutable observations.

use std::collections::BTreeSet;

use sqlx::SqliteConnection;

use super::model::{FieldSelection, MergeField, SelectionRow, SourceMergeField};
use super::repo::{self, MergeError};
use crate::{persons::model::PersonName, sources::model::SourceRecordInput};

pub(crate) struct SourceObservation {
    pub source_record_id: String,
    pub owner_id: String,
    pub display_name: Option<String>,
    pub name: PersonName,
    pub observed_at: String,
}

pub(crate) async fn observation(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<SourceObservation, sqlx::Error> {
    let (source_record_id, json, observed_at): (String, String, String) = sqlx::query_as(
        "SELECT source_record_id,observation,observed_at FROM source_record_history WHERE id=?1",
    )
    .bind(id)
    .fetch_one(conn)
    .await?;
    let input: SourceRecordInput = repo::decode(&json)?;
    Ok(SourceObservation {
        source_record_id,
        owner_id: input.entity_id,
        display_name: input.display_name,
        name: input.name,
        observed_at,
    })
}

pub(crate) async fn validate(
    conn: &mut SqliteConnection,
    canonical_id: &str,
    selections: &[FieldSelection],
    preferred_point_ids: &[String],
    members: &BTreeSet<String>,
) -> Result<Vec<SelectionRow>, MergeError> {
    let mut fields = BTreeSet::new();
    let mut rows = Vec::new();
    for selection in selections {
        let field = selection.field();
        if !fields.insert(field) {
            return Err(MergeError::Invalid(
                "Select each scalar field at most once".into(),
            ));
        }
        let mut row = SelectionRow {
            canonical_id: canonical_id.into(),
            field: field.key().into(),
            owner_entity_id: None,
            point_id: None,
            source_history_id: None,
        };
        match selection {
            FieldSelection::Entity { entity_id, .. } => {
                if !members.contains(entity_id) {
                    return Err(MergeError::Invalid(
                        "Selected entity must belong to the resulting group".into(),
                    ));
                }
                if field == MergeField::PersonProfile {
                    let present: bool = sqlx::query_scalar(
                        "SELECT EXISTS(SELECT 1 FROM person_profiles WHERE entity_id=?1)",
                    )
                    .bind(entity_id)
                    .fetch_one(&mut *conn)
                    .await?;
                    if !present {
                        return Err(MergeError::Invalid(
                            "Selected person profile does not exist".into(),
                        ));
                    }
                }
                row.owner_entity_id = Some(entity_id.clone());
            }
            FieldSelection::SourceRecord {
                field,
                source_record_id,
            } => {
                let source:Option<(String,String)> = sqlx::query_as(
                    "SELECT r.entity_id,h.id FROM source_records r JOIN source_record_history h ON h.source_record_id=r.id WHERE r.id=?1 ORDER BY h.rowid DESC LIMIT 1")
                    .bind(source_record_id).fetch_optional(&mut *conn).await?;
                let (owner, history_id) = source.ok_or_else(|| {
                    MergeError::Invalid("Selected source observation does not exist".into())
                })?;
                if !members.contains(&owner) {
                    return Err(MergeError::Invalid(
                        "Selected source must belong to the resulting group".into(),
                    ));
                }
                let observed = observation(conn, &history_id).await?;
                if observed.owner_id != owner {
                    return Err(MergeError::Invalid(
                        "Source observation ownership does not agree".into(),
                    ));
                }
                match field {
                    SourceMergeField::Name
                        if observed
                            .display_name
                            .as_ref()
                            .is_none_or(|name| name.trim().is_empty()) =>
                    {
                        return Err(MergeError::Invalid(
                            "Selected source has no display name".into(),
                        ))
                    }
                    SourceMergeField::PersonProfile => {
                        let parts = [
                            &observed.name.given_name,
                            &observed.name.additional_names,
                            &observed.name.family_name,
                            &observed.name.name_prefix,
                            &observed.name.name_suffix,
                        ];
                        if !parts
                            .into_iter()
                            .flatten()
                            .any(|part| !part.trim().is_empty())
                        {
                            return Err(MergeError::Invalid(
                                "Selected source has no structured name evidence".into(),
                            ));
                        }
                    }
                    SourceMergeField::Name => {}
                }
                row.source_history_id = Some(history_id);
            }
        }
        rows.push(row);
    }
    let mut kinds = BTreeSet::new();
    for point_id in preferred_point_ids {
        let point: Option<(String, String)> =
            sqlx::query_as("SELECT entity_id,kind FROM contact_points WHERE id=?1")
                .bind(point_id)
                .fetch_optional(&mut *conn)
                .await?;
        let (owner, kind) = point
            .ok_or_else(|| MergeError::Invalid("Selected contact point does not exist".into()))?;
        if !members.contains(&owner) || !kinds.insert(kind.clone()) {
            return Err(MergeError::Invalid(
                "Select at most one group contact point per kind".into(),
            ));
        }
        rows.push(SelectionRow {
            canonical_id: canonical_id.into(),
            field: format!("point:{kind}"),
            owner_entity_id: None,
            point_id: Some(point_id.clone()),
            source_history_id: None,
        });
    }
    Ok(rows)
}
