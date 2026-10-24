//! Read-time field selection preserves every original member row.

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{AppliedSelection, MergeField, SelectionRow, SourceMergeField};
use super::repo;
use crate::entities::{model::EntityRow, repo::get_stored};
use crate::persons::model::{ContactPoint, ContactPointKind, PersonProfile};

/// Apply scalar selections inside the caller's consistent directory snapshot.
pub async fn entity(
    conn: &mut SqliteConnection,
    mut row: EntityRow,
) -> Result<EntityRow, sqlx::Error> {
    for selection in repo::selections(conn, &row.id).await? {
        if let Some(owner) = selection.owner_entity_id {
            let source = get_stored(conn, &owner)
                .await?
                .ok_or(sqlx::Error::RowNotFound)?;
            let field: MergeField = decode_field(&selection.field)?;
            match field {
                MergeField::Name => row.name = source.name,
                MergeField::Abn => row.abn = source.abn,
                MergeField::Aliases => row.aliases = source.aliases,
                MergeField::DefaultTransactionType => {
                    row.default_transaction_type = source.default_transaction_type
                }
                MergeField::DefaultTags => row.default_tags = source.default_tags,
                MergeField::Notes => row.notes = source.notes,
                MergeField::AvatarAssetId => row.avatar_asset_id = source.avatar_asset_id,
                MergeField::PosterAssetId => row.poster_asset_id = source.poster_asset_id,
                MergeField::PersonProfile => {}
            }
        } else if let Some(history) = selection.source_history_id {
            let field: SourceMergeField = decode_field(&selection.field)?;
            match field {
                SourceMergeField::Name => {
                    row.name = super::selections::observation(conn, &history)
                        .await?
                        .display_name
                        .ok_or_else(|| {
                            sqlx::Error::Protocol("Selected source name is absent".into())
                        })?
                }
                SourceMergeField::PersonProfile => {}
            }
        }
    }
    Ok(row)
}

/// Resolve the selected retained local name profile; absence preserves the canonical winner default.
pub async fn profile_owner(conn: &mut SqliteConnection, id: &str) -> Result<String, sqlx::Error> {
    let canonical = repo::resolve_one(conn, id)
        .await?
        .unwrap_or_else(|| id.into());
    let selected: Option<String> = sqlx::query_scalar(
        "SELECT owner_entity_id FROM merge_selections WHERE canonical_id=?1 AND field='personProfile' AND owner_entity_id IS NOT NULL")
        .bind(&canonical).fetch_optional(conn).await?;
    Ok(selected.unwrap_or(canonical))
}

/// Read active group points and retained explicit preferences, with one effective preference per kind.
/// Original per-member preference flags remain stored unchanged for undo.
pub async fn points(pool: &SqlitePool, id: &str) -> Result<Vec<ContactPoint>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let points = points_in_transaction(&mut tx, id).await?;
    tx.commit().await?;
    Ok(points)
}

/// Project retained group points and effective preferences within the caller's consistent snapshot.
pub async fn points_in_transaction(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Vec<ContactPoint>, sqlx::Error> {
    let canonical = repo::resolve_one(conn, id)
        .await?
        .unwrap_or_else(|| id.into());
    let selected = repo::selections(conn, &canonical).await?;
    let mut rows: Vec<ContactPoint> = sqlx::query_as(
        "SELECT id,entity_id,kind,value,normalized_value,label,country_code,source_record_id,active,preferred,created_at FROM contact_points WHERE entity_id=?1 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1) ORDER BY created_at,id")
        .bind(&canonical).fetch_all(&mut *conn).await?;
    for point in &mut rows {
        let field = format!("point:{}", point.kind);
        let selection = selected.iter().find(|selection| selection.field == field);
        point.preferred = match selection {
            Some(selection) => selection.point_id.as_deref() == Some(&point.id),
            None => point.entity_id == canonical && point.preferred,
        };
    }
    rows.retain(|point| point.active || point.preferred);
    Ok(rows)
}

/// Select a retained member point for a canonical group without rewriting its provenance.
pub async fn prefer_point(
    conn: &mut SqliteConnection,
    canonical: &str,
    point_id: &str,
) -> Result<bool, sqlx::Error> {
    let kind: Option<String> = sqlx::query_scalar(
        "SELECT kind FROM contact_points WHERE id=?1 AND (entity_id=?2 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?2))")
        .bind(point_id).bind(canonical).fetch_optional(&mut *conn).await?;
    let Some(kind) = kind else { return Ok(false) };
    repo::put_selection(
        conn,
        &SelectionRow {
            canonical_id: canonical.into(),
            field: format!("point:{kind}"),
            owner_entity_id: None,
            point_id: Some(point_id.into()),
            source_history_id: None,
        },
    )
    .await?;
    Ok(true)
}

fn decode_field<T: serde::de::DeserializeOwned>(field: &str) -> Result<T, sqlx::Error> {
    serde_json::from_value(serde_json::Value::String(field.into()))
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))
}

/// Read a manually selected immutable imported name, including its original source provenance.
pub async fn source_profile(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<PersonProfile>, sqlx::Error> {
    let canonical = repo::resolve_one(conn, id)
        .await?
        .unwrap_or_else(|| id.into());
    let history:Option<String>=sqlx::query_scalar("SELECT source_history_id FROM merge_selections WHERE canonical_id=?1 AND field='personProfile' AND source_history_id IS NOT NULL")
        .bind(canonical).fetch_optional(&mut *conn).await?;
    let Some(history) = history else {
        return Ok(None);
    };
    let source = super::selections::observation(conn, &history).await?;
    Ok(Some(PersonProfile {
        entity_id: source.owner_id,
        name: source.name,
        updated_at: source.observed_at,
        source_record_id: Some(source.source_record_id),
        source_observation_id: Some(history),
    }))
}

/// Expose validated field references and the exact source observation retained by each selection.
pub async fn applied_selections(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Vec<AppliedSelection>, sqlx::Error> {
    let mut applied = Vec::new();
    for selection in repo::selections(conn, id).await? {
        if let Some(entity_id) = selection.owner_entity_id {
            applied.push(AppliedSelection::Entity {
                field: decode_field(&selection.field)?,
                entity_id,
            });
        } else if let Some(history) = selection.source_history_id {
            let source = super::selections::observation(conn, &history).await?;
            applied.push(AppliedSelection::SourceRecord {
                field: decode_field(&selection.field)?,
                source_record_id: source.source_record_id,
                source_observation_id: history,
            });
        } else if let Some(point_id) = selection.point_id {
            let kind: String = sqlx::query_scalar("SELECT kind FROM contact_points WHERE id=?1")
                .bind(&point_id)
                .fetch_one(&mut *conn)
                .await?;
            let point_kind: ContactPointKind = decode_field(&kind)?;
            applied.push(AppliedSelection::Point {
                point_kind,
                point_id,
            });
        }
    }
    Ok(applied)
}
