//! Current fact projections retain original evidence and apply exact-identity local decisions.

use std::collections::HashMap;

use sqlx::SqliteConnection;

use super::{
    facts_model::{Decision, DecisionValue},
    model::ContactPoint,
};
use crate::entities::{addresses_model::AddressRow, model::EntityRow};
use crate::merges::repo::{decode, resolve_one};

pub(crate) async fn decisions(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Vec<Decision>, sqlx::Error> {
    sqlx::query_as("SELECT entity_id,target,operation_id,value FROM person_fact_decisions WHERE entity_id=?1 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1)")
        .bind(id).fetch_all(conn).await
}

pub(crate) async fn decision(
    conn: &mut SqliteConnection,
    id: &str,
    target: &str,
) -> Result<Option<Decision>, sqlx::Error> {
    sqlx::query_as("SELECT entity_id,target,operation_id,value FROM person_fact_decisions WHERE entity_id=?1 AND target=?2")
        .bind(id).bind(target).fetch_optional(conn).await
}

pub(crate) async fn target(
    conn: &mut SqliteConnection,
    kind: &str,
    id: &str,
) -> Result<String, sqlx::Error> {
    let target: Option<String> =
        sqlx::query_scalar("SELECT target FROM person_fact_origins WHERE kind=?1 AND id=?2")
            .bind(kind)
            .bind(id)
            .fetch_optional(conn)
            .await?;
    Ok(target.unwrap_or_else(|| format!("{kind}:{id}")))
}

/// Apply the canonical person's explicit display-name and notes choice after merge selections.
pub async fn entity(conn: &mut SqliteConnection, row: &mut EntityRow) -> Result<(), sqlx::Error> {
    if let Some(local) = decision(conn, &row.id, "entity:name").await? {
        if let DecisionValue::Entity { name, .. } = decode(&local.value)? {
            row.name = name;
        }
    }
    if let Some(local) = decision(conn, &row.id, "entity:notes").await? {
        if let DecisionValue::Entity { notes, .. } = decode(&local.value)? {
            row.notes = notes;
        }
    }
    let changed: Option<String> = sqlx::query_scalar("SELECT MAX(o.created_at) FROM person_fact_decisions d JOIN person_fact_operations o ON o.id=d.operation_id WHERE d.entity_id=?1 AND d.target IN ('entity:name','entity:notes')")
        .bind(&row.id).fetch_one(conn).await?;
    if let Some(changed) = changed {
        if changed > row.last_edited_time {
            row.last_edited_time = changed;
        }
    }
    Ok(())
}

/// Filter replaced or hidden observations without modifying source bytes, activity or ownership.
pub async fn points(
    conn: &mut SqliteConnection,
    canonical: &str,
    rows: &mut Vec<ContactPoint>,
) -> Result<(), sqlx::Error> {
    let decisions = decisions(conn, canonical).await?;
    let origins: Vec<(String,String)> = sqlx::query_as("SELECT id,target FROM person_fact_origins WHERE kind='point' AND (entity_id=?1 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1))")
        .bind(canonical).fetch_all(&mut *conn).await?;
    let origins: HashMap<String, String> = origins.into_iter().collect();
    let mut visible = Vec::with_capacity(rows.len());
    for point in rows.drain(..) {
        let target = origins
            .get(&point.id)
            .cloned()
            .unwrap_or_else(|| format!("point:{}", point.id));
        let local = decisions
            .iter()
            .find(|d| d.entity_id == canonical && d.target == target)
            .or_else(|| {
                decisions
                    .iter()
                    .find(|d| d.entity_id == point.entity_id && d.target == target)
            });
        let show = match local {
            Some(local) => {
                matches!(decode::<DecisionValue>(&local.value)?, DecisionValue::Point { id } if id == point.id)
            }
            None => !origins.contains_key(&point.id),
        };
        if show {
            visible.push(point);
        }
    }
    *rows = visible;
    Ok(())
}

/// Read a retained point unless a local fact decision hides it; inactive provider evidence remains selectable.
pub async fn selectable_point(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<ContactPoint>, sqlx::Error> {
    let point: Option<ContactPoint> = sqlx::query_as("SELECT id,entity_id,kind,value,normalized_value,label,country_code,source_record_id,active,preferred,created_at FROM contact_points WHERE id=?1")
        .bind(id).fetch_optional(&mut *conn).await?;
    let Some(point) = point else { return Ok(None) };
    let canonical = resolve_one(conn, &point.entity_id)
        .await?
        .unwrap_or_else(|| point.entity_id.clone());
    let mut rows = vec![point];
    points(conn, &canonical, &mut rows).await?;
    Ok(rows.pop())
}

/// Read effective addresses within an existing consistent snapshot, preserving retained address IDs.
pub async fn addresses(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Vec<AddressRow>, sqlx::Error> {
    let canonical = resolve_one(conn, id).await?.unwrap_or_else(|| id.into());
    let decisions = decisions(conn, &canonical).await?;
    let rows: Vec<AddressRow> = sqlx::query_as("SELECT id,entity_id,value,label,city,last_edited_time FROM entity_addresses WHERE entity_id=?1 OR entity_id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1) ORDER BY last_edited_time,id")
        .bind(&canonical).fetch_all(&mut *conn).await?;
    let mut visible = Vec::with_capacity(rows.len());
    for mut address in rows {
        let target = format!("address:{}", address.id);
        let local = decisions
            .iter()
            .find(|d| d.entity_id == canonical && d.target == target)
            .or_else(|| {
                decisions
                    .iter()
                    .find(|d| d.entity_id == address.entity_id && d.target == target)
            });
        if let Some(local) = local {
            if let DecisionValue::Address { value, label, city } = decode(&local.value)? {
                address.value = value;
                address.label = label;
                address.city = city;
                address.last_edited_time =
                    sqlx::query_scalar("SELECT created_at FROM person_fact_operations WHERE id=?1")
                        .bind(&local.operation_id)
                        .fetch_one(&mut *conn)
                        .await?;
                visible.push(address);
            }
        } else {
            let local_created: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM person_fact_origins WHERE kind='address' AND id=?1)",
            )
            .bind(&address.id)
            .fetch_one(&mut *conn)
            .await?;
            if !local_created {
                visible.push(address);
            }
        }
    }
    Ok(visible)
}
