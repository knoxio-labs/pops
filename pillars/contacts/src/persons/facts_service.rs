//! Atomic local fact decisions, immutable receipts and ownership-checked undo.

use sqlx::{SqliteConnection, SqlitePool};

use super::facts_history::{
    remember_selection, remove_point_preference, set_decision, set_selection_owner, snapshot,
    undoable,
};
use super::{facts_model::*, facts_projection, repo as persons};
use crate::entities::addresses_model::CreateAddressBody;
use crate::merges::repo::{self, conflict, decode, encode, MergeError};
use crate::time::now_rfc3339;

pub(crate) fn person_error(error: persons::PersonError) -> MergeError {
    match error {
        persons::PersonError::NotFound => MergeError::NotFound("Person or fact".into()),
        persons::PersonError::Retired(id) => MergeError::Conflict {
            message: "Entity ID is retired".into(),
            canonical_id: Some(id),
            revision: None,
        },
        persons::PersonError::Invalid(message) => MergeError::Invalid(message),
        persons::PersonError::Db(error) => MergeError::Db(error),
    }
}

/// Read a person's complete editable state and undo availability from one SQLite snapshot.
pub async fn get(pool: &SqlitePool, id: &str) -> Result<FactsSnapshot, MergeError> {
    let mut tx = pool.begin().await?;
    let canonical = repo::resolve_one(&mut tx, id)
        .await?
        .ok_or_else(|| MergeError::NotFound(id.into()))?;
    persons::require_person(&mut tx, &canonical)
        .await
        .map_err(person_error)?;
    let result = snapshot(&mut tx, &canonical).await?;
    tx.commit().await?;
    Ok(result)
}

fn validate_key(key: &str) -> Result<(), MergeError> {
    if key.is_empty() || key.len() > 256 {
        return Err(MergeError::Invalid(
            "Idempotency key must be nonempty and at most 256 bytes".into(),
        ));
    }
    Ok(())
}

/// Apply every explicit draft change together; imported rows are retained and selections point to new local observations.
pub async fn apply(
    pool: &SqlitePool,
    id: &str,
    body: FactChangeBody,
) -> Result<FactReceipt, MergeError> {
    validate_key(&body.idempotency_key)?;
    if body.changes.is_empty() {
        return Err(MergeError::Invalid(
            "At least one fact change is required".into(),
        ));
    }
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let action = format!("facts:{id}:apply");
    let hash = crate::digest::sha256_hex(encode(&body)?.as_bytes());
    if let Some(receipt) = repo::receipt(&mut tx, &action, &body.idempotency_key, &hash).await? {
        return Ok(receipt);
    }
    persons::require_writable_person(&mut tx, id)
        .await
        .map_err(person_error)?;
    repo::expect_revision(&mut tx, body.expected_version).await?;
    let operation = uuid::Uuid::new_v4().to_string();
    let mut evidence = Evidence {
        changes: body.changes.clone(),
        ..Evidence::default()
    };
    let initial = snapshot(&mut tx, id).await?;
    let mut prepared = Vec::with_capacity(body.changes.len());
    for change in body.changes {
        let change = prepare(&mut tx, change, &initial).await?;
        if prepared.iter().any(|(target, _)| target == &change.0) {
            return Err(MergeError::Invalid(
                "A fact may change only once in an operation".into(),
            ));
        }
        prepared.push(change);
    }
    sqlx::query("INSERT INTO person_fact_operations(id,entity_id,created_at) VALUES(?1,?2,?3)")
        .bind(&operation)
        .bind(id)
        .bind(now_rfc3339())
        .execute(&mut *tx)
        .await?;
    for (target, change) in prepared {
        let targets = if target == "entity" {
            vec!["entity:name".into(), "entity:notes".into()]
        } else {
            vec![target.clone()]
        };
        for target in &targets {
            evidence.decisions.push(DecisionEvidence {
                before: facts_projection::decision(&mut tx, id, target).await?,
                target: target.clone(),
            });
        }
        let editing_point = matches!(&change, FactChange::EditPoint { .. });
        let value = execute_change(&mut tx, id, &target, change, &mut evidence).await?;
        for target in targets {
            set_decision(&mut tx, id, &target, &operation, &encode(&value)?).await?;
        }
        if let (true, DecisionValue::Point { id: point_id }) = (editing_point, &value) {
            crate::merges::projection::prefer_point(&mut tx, id, point_id).await?;
        }
    }
    for selection in &evidence.selections {
        set_selection_owner(&mut tx, id, &selection.field, Some(&operation)).await?;
    }
    sqlx::query("INSERT INTO person_fact_operation_evidence(operation_id,evidence) VALUES(?1,?2)")
        .bind(&operation)
        .bind(encode(&evidence)?)
        .execute(&mut *tx)
        .await?;
    let response = FactReceipt {
        data: snapshot(&mut tx, id).await?,
        operation: FactOperationReceipt {
            id: operation,
            undone_operation_id: None,
        },
    };
    repo::save_receipt(&mut tx, &action, &body.idempotency_key, &hash, &response).await?;
    tx.commit().await?;
    Ok(response)
}

async fn prepare(
    conn: &mut SqliteConnection,
    change: FactChange,
    snapshot: &FactsSnapshot,
) -> Result<(String, FactChange), MergeError> {
    let target = match &change {
        FactChange::SetEntity { name, .. } => {
            if name.trim().is_empty() || name.len() > 1024 {
                return Err(MergeError::Invalid(
                    "Person display name must be nonempty and at most 1024 bytes".into(),
                ));
            }
            "entity".into()
        }
        FactChange::AddPoint { point } => {
            persons::validate_point(point).map_err(person_error)?;
            format!("point:{}", uuid::Uuid::new_v4())
        }
        FactChange::EditPoint { point_id, point } => {
            persons::validate_point(point).map_err(person_error)?;
            if !snapshot.points.iter().any(|point| point.id == *point_id) {
                return Err(conflict(
                    "Contact point is no longer in the current projection",
                ));
            }
            facts_projection::target(conn, "point", point_id).await?
        }
        FactChange::RemovePoint { point_id } => {
            if !snapshot.points.iter().any(|point| point.id == *point_id) {
                return Err(conflict(
                    "Contact point is no longer in the current projection",
                ));
            }
            facts_projection::target(conn, "point", point_id).await?
        }
        FactChange::AddAddress { address } => {
            validate_address(address)?;
            format!("address:{}", uuid::Uuid::new_v4())
        }
        FactChange::EditAddress {
            address_id,
            address,
        } => {
            validate_address(address)?;
            if !snapshot
                .addresses
                .iter()
                .any(|address| address.id == *address_id)
            {
                return Err(conflict("Address is no longer in the current projection"));
            }
            format!("address:{address_id}")
        }
        FactChange::RemoveAddress { address_id } => {
            if !snapshot
                .addresses
                .iter()
                .any(|address| address.id == *address_id)
            {
                return Err(conflict("Address is no longer in the current projection"));
            }
            format!("address:{address_id}")
        }
    };
    Ok((target, change))
}

fn validate_address(address: &CreateAddressBody) -> Result<(), MergeError> {
    if address.value.trim().is_empty() {
        return Err(MergeError::Invalid("Address value is required".into()));
    }
    Ok(())
}

async fn execute_change(
    conn: &mut SqliteConnection,
    id: &str,
    target: &str,
    change: FactChange,
    evidence: &mut Evidence,
) -> Result<DecisionValue, MergeError> {
    let editing = matches!(&change, FactChange::EditPoint { .. });
    let old_point = match &change {
        FactChange::EditPoint { point_id, .. } => Some(point_id.clone()),
        _ => None,
    };
    match change {
        FactChange::SetEntity { name, notes } => {
            for field in ["name", "notes"] {
                remember_selection(conn, id, field, evidence).await?;
                sqlx::query("DELETE FROM merge_selections WHERE canonical_id=?1 AND field=?2")
                    .bind(id)
                    .bind(field)
                    .execute(&mut *conn)
                    .await?;
            }
            Ok(DecisionValue::Entity { name, notes })
        }
        FactChange::AddPoint { point } | FactChange::EditPoint { point, .. } => {
            if let Some(old) = old_point {
                remove_point_preference(conn, id, &old, evidence).await?;
            }
            let point = persons::insert_point(conn, id, &point, None)
                .await
                .map_err(person_error)?;
            sqlx::query("INSERT INTO person_fact_origins(kind,id,entity_id,target) VALUES('point',?1,?2,?3)")
                .bind(&point.id).bind(id).bind(target).execute(&mut *conn).await?;
            if editing {
                let field = format!("point:{}", point.kind);
                remember_selection(conn, id, &field, evidence).await?;
            }
            Ok(DecisionValue::Point { id: point.id })
        }
        FactChange::RemovePoint { point_id } => {
            remove_point_preference(conn, id, &point_id, evidence).await?;
            Ok(DecisionValue::Hidden)
        }
        FactChange::AddAddress { address } => {
            let address_id = target
                .strip_prefix("address:")
                .ok_or_else(|| MergeError::Invalid("Invalid address target".into()))?;
            sqlx::query("INSERT INTO entity_addresses(id,entity_id,value,label,city,last_edited_time) VALUES(?1,?2,?3,?4,?5,?6)")
                .bind(address_id).bind(id).bind(&address.value).bind(&address.label).bind(&address.city).bind(now_rfc3339()).execute(&mut *conn).await?;
            sqlx::query("INSERT INTO person_fact_origins(kind,id,entity_id,target) VALUES('address',?1,?2,?3)")
                .bind(address_id).bind(id).bind(target).execute(conn).await?;
            Ok(DecisionValue::Address {
                value: address.value,
                label: address.label,
                city: address.city,
            })
        }
        FactChange::EditAddress { address, .. } => Ok(DecisionValue::Address {
            value: address.value,
            label: address.label,
            city: address.city,
        }),
        FactChange::RemoveAddress { .. } => Ok(DecisionValue::Hidden),
    }
}

/// Reverse only a still-owned local operation; provider refreshes and unrelated writes remain intact.
pub async fn undo(
    pool: &SqlitePool,
    id: &str,
    operation: &str,
    body: FactUndoBody,
) -> Result<FactReceipt, MergeError> {
    validate_key(&body.idempotency_key)?;
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let action = format!("facts:{id}:undo:{operation}");
    let hash = crate::digest::sha256_hex(encode(&body)?.as_bytes());
    if let Some(receipt) = repo::receipt(&mut tx, &action, &body.idempotency_key, &hash).await? {
        return Ok(receipt);
    }
    persons::require_writable_person(&mut tx, id)
        .await
        .map_err(person_error)?;
    repo::expect_revision(&mut tx, body.expected_version).await?;
    let stored:Option<String>=sqlx::query_scalar("SELECT e.evidence FROM person_fact_operations o JOIN person_fact_operation_evidence e ON e.operation_id=o.id WHERE o.id=?1 AND o.entity_id=?2 AND o.undo_of IS NULL")
        .bind(operation).bind(id).fetch_optional(&mut *tx).await?;
    let evidence: Evidence =
        decode(&stored.ok_or_else(|| MergeError::NotFound(operation.into()))?)?;
    if !undoable(&mut tx, id, operation, &evidence).await? {
        return Err(conflict(
            "A later decision changed these facts or preferences; this operation cannot be undone",
        ));
    }
    for selection in &evidence.selections {
        sqlx::query("DELETE FROM merge_selections WHERE canonical_id=?1 AND field=?2")
            .bind(id)
            .bind(&selection.field)
            .execute(&mut *tx)
            .await?;
        if let Some(before) = &selection.before {
            repo::put_selection(&mut tx, before).await?;
        }
        set_selection_owner(
            &mut tx,
            id,
            &selection.field,
            selection.before_owner.as_deref(),
        )
        .await?;
    }
    for decision in &evidence.decisions {
        match &decision.before {
            Some(before) => {
                set_decision(
                    &mut tx,
                    id,
                    &before.target,
                    &before.operation_id,
                    &before.value,
                )
                .await?
            }
            None => {
                sqlx::query("DELETE FROM person_fact_decisions WHERE entity_id=?1 AND target=?2")
                    .bind(id)
                    .bind(&decision.target)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }
    let undo_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO person_fact_operations(id,entity_id,undo_of,created_at) VALUES(?1,?2,?3,?4)",
    )
    .bind(&undo_id)
    .bind(id)
    .bind(operation)
    .bind(now_rfc3339())
    .execute(&mut *tx)
    .await?;
    let response = FactReceipt {
        data: snapshot(&mut tx, id).await?,
        operation: FactOperationReceipt {
            id: undo_id,
            undone_operation_id: Some(operation.into()),
        },
    };
    repo::save_receipt(&mut tx, &action, &body.idempotency_key, &hash, &response).await?;
    tx.commit().await?;
    Ok(response)
}
