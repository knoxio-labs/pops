//! Merge snapshots retain local decisions and preference ownership displaced by explicit selections.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use super::repo::{conflict, MergeError};
use crate::persons::facts_model::Decision;

#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
struct PreferenceOwner {
    entity_id: String,
    field: String,
    operation_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub(super) struct FactSnapshot {
    decisions: Vec<Decision>,
    preference_owners: Vec<PreferenceOwner>,
}

pub(super) async fn snapshot(
    conn: &mut SqliteConnection,
    members: &BTreeSet<String>,
) -> Result<FactSnapshot, sqlx::Error> {
    let mut decisions = Vec::new();
    let mut preference_owners = Vec::new();
    for member in members {
        decisions.extend(sqlx::query_as::<_, Decision>("SELECT entity_id,target,operation_id,value FROM person_fact_decisions WHERE entity_id=?1 ORDER BY target")
            .bind(member).fetch_all(&mut *conn).await?);
        preference_owners.extend(sqlx::query_as::<_, PreferenceOwner>("SELECT entity_id,field,operation_id FROM person_fact_selection_versions WHERE entity_id=?1 ORDER BY field")
            .bind(member).fetch_all(&mut *conn).await?);
    }
    Ok(FactSnapshot {
        decisions,
        preference_owners,
    })
}

pub(super) async fn require_legacy_safe(
    conn: &mut SqliteConnection,
    members: &[String],
) -> Result<(), MergeError> {
    for member in members {
        let has_facts: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM person_fact_operations WHERE entity_id=?1)",
        )
        .bind(member)
        .fetch_one(&mut *conn)
        .await?;
        if has_facts {
            return Err(conflict(
                "Merge has no retained local fact snapshot; automatic undo cannot restore its decisions",
            ));
        }
    }
    Ok(())
}

pub(super) async fn restore(
    conn: &mut SqliteConnection,
    members: &[String],
    snapshot: FactSnapshot,
) -> Result<(), sqlx::Error> {
    for member in members {
        sqlx::query("DELETE FROM person_fact_decisions WHERE entity_id=?1")
            .bind(member)
            .execute(&mut *conn)
            .await?;
        sqlx::query(
            "UPDATE person_fact_selection_versions SET operation_id=NULL WHERE entity_id=?1",
        )
        .bind(member)
        .execute(&mut *conn)
        .await?;
    }
    for decision in snapshot.decisions {
        sqlx::query("INSERT INTO person_fact_decisions(entity_id,target,operation_id,value) VALUES(?1,?2,?3,?4)")
            .bind(decision.entity_id).bind(decision.target).bind(decision.operation_id).bind(decision.value)
            .execute(&mut *conn).await?;
    }
    for owner in snapshot.preference_owners {
        sqlx::query("INSERT INTO person_fact_selection_versions(entity_id,field,version,operation_id) VALUES(?1,?2,0,?3) ON CONFLICT(entity_id,field) DO UPDATE SET operation_id=excluded.operation_id")
            .bind(owner.entity_id).bind(owner.field).bind(owner.operation_id).execute(&mut *conn).await?;
    }
    Ok(())
}
