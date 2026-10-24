//! Read-time field selection preserves every original member row.

use sqlx::{SqliteConnection, SqlitePool};

use super::model::SelectionRow;
use super::repo;
use crate::entities::{model::EntityRow, repo::get_stored};
use crate::persons::model::ContactPoint;

/// Apply scalar selections inside the caller's consistent directory snapshot.
pub async fn entity(
    conn: &mut SqliteConnection,
    mut row: EntityRow,
) -> Result<EntityRow, sqlx::Error> {
    for selection in repo::selections(conn, &row.id).await? {
        let Some(owner) = selection.owner_entity_id else {
            continue;
        };
        let Some(source) = get_stored(conn, &owner).await? else {
            continue;
        };
        match selection.field.as_str() {
            "name" => row.name = source.name,
            "abn" => row.abn = source.abn,
            "aliases" => row.aliases = source.aliases,
            "defaultTransactionType" => {
                row.default_transaction_type = source.default_transaction_type
            }
            "defaultTags" => row.default_tags = source.default_tags,
            "notes" => row.notes = source.notes,
            "avatarAssetId" => row.avatar_asset_id = source.avatar_asset_id,
            "posterAssetId" => row.poster_asset_id = source.poster_asset_id,
            _ => {}
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
        "SELECT owner_entity_id FROM merge_selections WHERE canonical_id=?1 AND field='personProfile'")
        .bind(&canonical).fetch_optional(conn).await?;
    Ok(selected.unwrap_or(canonical))
}

/// Read the full group's retained points with one effective preference per kind.
/// Original per-member preference flags remain stored unchanged for undo.
pub async fn points(pool: &SqlitePool, id: &str) -> Result<Vec<ContactPoint>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let canonical = repo::resolve_one(&mut tx, id)
        .await?
        .unwrap_or_else(|| id.into());
    let selected = repo::selections(&mut tx, &canonical).await?;
    let mut rows: Vec<ContactPoint> = sqlx::query_as(
        "SELECT id,entity_id,kind,value,normalized_value,label,country_code,source_record_id,active,preferred,created_at FROM contact_points WHERE entity_id=?1 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1) ORDER BY created_at,id")
        .bind(&canonical).fetch_all(&mut *tx).await?;
    for point in &mut rows {
        let field = format!("point:{}", point.kind);
        let selection = selected.iter().find(|selection| selection.field == field);
        point.preferred = match selection {
            Some(selection) => selection.point_id.as_deref() == Some(&point.id),
            None => point.entity_id == canonical && point.preferred,
        };
    }
    tx.commit().await?;
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
        },
    )
    .await?;
    Ok(true)
}
