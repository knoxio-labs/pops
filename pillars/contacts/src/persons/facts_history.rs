//! Immutable fact evidence and local preference ownership fences.

use super::{facts_model::*, facts_projection};
use crate::{
    entities::model::Entity,
    merges::repo::{self, decode, MergeError},
};
use sqlx::SqliteConnection;

pub(crate) async fn snapshot(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<FactsSnapshot, MergeError> {
    let stored = crate::entities::repo::get_stored(conn, id)
        .await?
        .ok_or_else(|| MergeError::NotFound(id.into()))?;
    let entity: Entity = crate::merges::projection::entity(conn, stored)
        .await?
        .into();
    let points = crate::merges::projection::points_in_transaction(conn, id).await?;
    let addresses = facts_projection::addresses(conn, id)
        .await?
        .into_iter()
        .map(Into::into)
        .collect();
    let rows:Vec<(String,Option<String>,String,String)>=sqlx::query_as("SELECT o.id,o.undo_of,o.created_at,COALESCE(e.evidence,'{}') FROM person_fact_operations o LEFT JOIN person_fact_operation_evidence e ON e.operation_id=o.id WHERE o.entity_id=?1 ORDER BY o.created_at,o.rowid")
        .bind(id).fetch_all(&mut *conn).await?;
    let mut operations = Vec::with_capacity(rows.len());
    for (operation, undo_of, created_at, evidence) in rows {
        let can_undo =
            undo_of.is_none() && undoable(conn, id, &operation, &decode(&evidence)?).await?;
        operations.push(FactOperation {
            id: operation,
            undone_operation_id: undo_of,
            created_at,
            can_undo,
        });
    }
    Ok(FactsSnapshot {
        version: repo::revision(conn).await?,
        entity,
        points,
        addresses,
        operations,
    })
}

pub(crate) async fn selection_owner(
    conn: &mut SqliteConnection,
    id: &str,
    field: &str,
) -> Result<Option<String>, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, Option<String>>(
        "SELECT operation_id FROM person_fact_selection_versions WHERE entity_id=?1 AND field=?2",
    )
    .bind(id)
    .bind(field)
    .fetch_optional(conn)
    .await?
    .flatten())
}

pub(crate) async fn set_selection_owner(
    conn: &mut SqliteConnection,
    id: &str,
    field: &str,
    owner: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO person_fact_selection_versions(entity_id,field,version,operation_id) VALUES(?1,?2,0,?3) ON CONFLICT(entity_id,field) DO UPDATE SET operation_id=excluded.operation_id")
        .bind(id).bind(field).bind(owner).execute(conn).await?;
    Ok(())
}

pub(crate) async fn remember_selection(
    conn: &mut SqliteConnection,
    id: &str,
    field: &str,
    evidence: &mut Evidence,
) -> Result<(), sqlx::Error> {
    if evidence
        .selections
        .iter()
        .any(|selection| selection.field == field)
    {
        return Ok(());
    }
    let before = repo::selections(conn, id)
        .await?
        .into_iter()
        .find(|selection| selection.field == field);
    let before_owner = selection_owner(conn, id, field).await?;
    evidence.selections.push(SelectionEvidence {
        field: field.into(),
        before,
        before_owner,
    });
    Ok(())
}

pub(crate) async fn remove_point_preference(
    conn: &mut SqliteConnection,
    id: &str,
    point_id: &str,
    evidence: &mut Evidence,
) -> Result<(), sqlx::Error> {
    let selected = repo::selections(conn, id)
        .await?
        .into_iter()
        .find(|selection| selection.point_id.as_deref() == Some(point_id));
    if let Some(selected) = selected {
        remember_selection(conn, id, &selected.field, evidence).await?;
        sqlx::query("DELETE FROM merge_selections WHERE canonical_id=?1 AND field=?2")
            .bind(id)
            .bind(&selected.field)
            .execute(conn)
            .await?;
    }
    Ok(())
}

pub(crate) async fn set_decision(
    conn: &mut SqliteConnection,
    id: &str,
    target: &str,
    operation: &str,
    value: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO person_fact_decisions(entity_id,target,operation_id,value) VALUES(?1,?2,?3,?4) ON CONFLICT(entity_id,target) DO UPDATE SET operation_id=excluded.operation_id,value=excluded.value")
        .bind(id).bind(target).bind(operation).bind(value).execute(conn).await?;
    Ok(())
}

pub(crate) async fn undoable(
    conn: &mut SqliteConnection,
    id: &str,
    operation: &str,
    evidence: &Evidence,
) -> Result<bool, sqlx::Error> {
    let already_undone: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM person_fact_operations WHERE undo_of=?1)")
            .bind(operation)
            .fetch_one(&mut *conn)
            .await?;
    if already_undone {
        return Ok(false);
    }
    for decision in &evidence.decisions {
        let Some(current) = facts_projection::decision(conn, id, &decision.target).await? else {
            return Ok(false);
        };
        if current.operation_id != operation {
            return Ok(false);
        }
        if decision.target.starts_with("point:") {
            for selected in repo::selections(conn, id).await? {
                if let Some(point) = selected.point_id {
                    if facts_projection::target(conn, "point", &point).await? == decision.target
                        && selection_owner(conn, id, &selected.field).await?.as_deref()
                            != Some(operation)
                    {
                        return Ok(false);
                    }
                }
            }
        }
    }
    for selection in &evidence.selections {
        if selection_owner(conn, id, &selection.field)
            .await?
            .as_deref()
            != Some(operation)
        {
            return Ok(false);
        }
    }
    Ok(true)
}
