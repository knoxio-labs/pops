//! Atomic subset merges and undo. Any later directory mutation conservatively fences undo.

use std::collections::BTreeSet;

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{
    MergeBody, MergeField, MergeResult, RedirectRow, SelectionRow, UndoBody, UndoResult,
};
use super::repo::{self, conflict, MergeError};
use crate::digest::sha256_hex;
use crate::time::now_rfc3339;

fn validate_key(key: &str) -> Result<(), MergeError> {
    if key.trim().is_empty() || key.len() > 128 {
        return Err(MergeError::Invalid(
            "Idempotency key must contain 1..128 bytes".into(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_decision(key: &str, evidence: &str) -> Result<(), MergeError> {
    validate_key(key)?;
    if evidence.trim().is_empty() || evidence.len() > 4096 {
        return Err(MergeError::Invalid(
            "Decision evidence must contain 1..4096 bytes".into(),
        ));
    }
    Ok(())
}

async fn validate_selections(
    conn: &mut SqliteConnection,
    body: &MergeBody,
    members: &BTreeSet<String>,
) -> Result<Vec<SelectionRow>, MergeError> {
    let mut selected_fields = BTreeSet::new();
    let mut result = Vec::new();
    for selection in &body.selections {
        if !members.contains(&selection.entity_id) || !selected_fields.insert(selection.field) {
            return Err(MergeError::Invalid(
                "Selection must name one field and a retained group member".into(),
            ));
        }
        if selection.field == MergeField::PersonProfile {
            let present: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM person_profiles WHERE entity_id=?1)",
            )
            .bind(&selection.entity_id)
            .fetch_one(&mut *conn)
            .await?;
            if !present {
                return Err(MergeError::Invalid(
                    "Selected person profile does not exist".into(),
                ));
            }
        }
        result.push(SelectionRow {
            canonical_id: body.canonical_id.clone(),
            field: selection.field.key().into(),
            owner_entity_id: Some(selection.entity_id.clone()),
            point_id: None,
        });
    }
    let mut kinds = BTreeSet::new();
    for point_id in &body.preferred_point_ids {
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
        result.push(SelectionRow {
            canonical_id: body.canonical_id.clone(),
            field: format!("point:{kind}"),
            owner_entity_id: None,
            point_id: Some(point_id.clone()),
        });
    }
    Ok(result)
}

/// Merge only the explicitly selected canonical groups. Original entities, sources and addresses stay owned.
/// An identical retry returns its immutable receipt even after later directory edits or undo.
pub async fn merge(pool: &SqlitePool, mut body: MergeBody) -> Result<MergeResult, MergeError> {
    validate_decision(&body.idempotency_key, &body.evidence)?;
    if body.member_ids.is_empty()
        || body.member_ids.len() > 499
        || body.selections.len() > 9
        || body.preferred_point_ids.len() > 4
    {
        return Err(MergeError::Invalid(
            "Merge requires 1..499 other roots and bounded selections".into(),
        ));
    }
    body.member_ids.sort();
    body.selections.sort_by_key(|selection| selection.field);
    body.preferred_point_ids.sort();
    if body.member_ids.windows(2).any(|pair| pair[0] == pair[1])
        || body.member_ids.contains(&body.canonical_id)
    {
        return Err(MergeError::Invalid("Merge roots must be distinct".into()));
    }
    let request_body = repo::encode(&body)?;
    let hash = sha256_hex(request_body.as_bytes());
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some(result) = repo::receipt(&mut tx, "merge", &body.idempotency_key, &hash).await? {
        tx.commit().await?;
        return Ok(result);
    }
    repo::expect_revision(&mut tx, body.expected_revision).await?;
    let mut all_members = BTreeSet::new();
    let mut roots = body.member_ids.clone();
    roots.push(body.canonical_id.clone());
    let mut before_redirects = Vec::new();
    let mut before_selections = Vec::new();
    for root in &roots {
        repo::require_root(&mut tx, root).await?;
        all_members.extend(repo::members(&mut tx, root).await?);
        before_selections.extend(repo::selections(&mut tx, root).await?);
    }
    if all_members.len() > 500 {
        return Err(MergeError::Invalid(
            "Resulting merge group may contain at most 500 members".into(),
        ));
    }
    let pairs: Vec<(String, String)> = sqlx::query_as("SELECT left_id,right_id FROM keep_separate")
        .fetch_all(&mut *tx)
        .await?;
    if pairs
        .iter()
        .any(|(left, right)| all_members.contains(left) && all_members.contains(right))
    {
        return Err(conflict(
            "A retained keep-separate decision prevents this merge",
        ));
    }
    let selected = validate_selections(&mut tx, &body, &all_members).await?;
    for member in &all_members {
        if let Some(previous) = repo::redirect(&mut tx, member).await? {
            before_redirects.push(previous);
        }
    }
    for root in &body.member_ids {
        sqlx::query("UPDATE entity_redirects SET canonical_id=?1 WHERE canonical_id=?2")
            .bind(&body.canonical_id)
            .bind(root)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO entity_redirects(member_id,canonical_id) VALUES(?1,?2)")
            .bind(root)
            .bind(&body.canonical_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM merge_selections WHERE canonical_id=?1")
            .bind(root)
            .execute(&mut *tx)
            .await?;
    }
    for selection in selected {
        repo::put_selection(&mut tx, &selection).await?;
    }
    let revision = repo::revision(&mut tx).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let member_ids: Vec<String> = all_members.into_iter().collect();
    sqlx::query("INSERT INTO merge_operations(id,canonical_id,member_ids,before_redirects,before_selections,request_body,post_revision,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)")
        .bind(&id).bind(&body.canonical_id).bind(repo::encode(&member_ids)?)
        .bind(repo::encode(&before_redirects)?).bind(repo::encode(&before_selections)?)
        .bind(request_body).bind(revision).bind(now_rfc3339()).execute(&mut *tx).await?;
    let result = MergeResult {
        operation_id: id,
        canonical_id: body.canonical_id,
        member_ids,
        revision,
    };
    repo::save_receipt(&mut tx, "merge", &body.idempotency_key, &hash, &result).await?;
    tx.commit().await?;
    Ok(result)
}

/// Undo the latest untouched merge. Any subsequent directory mutation, even elsewhere, requires manual review.
/// References written in other pillars after a merge remain references to the chosen canonical UUID.
pub async fn undo(
    pool: &SqlitePool,
    operation_id: &str,
    body: UndoBody,
) -> Result<UndoResult, MergeError> {
    validate_key(&body.idempotency_key)?;
    let request_body = repo::encode(&(operation_id, &body))?;
    let hash = sha256_hex(request_body.as_bytes());
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some(result) = repo::receipt(&mut tx, "undo", &body.idempotency_key, &hash).await? {
        tx.commit().await?;
        return Ok(result);
    }
    repo::expect_revision(&mut tx, body.expected_revision).await?;
    let operation: Option<(String,String,String,i64)> = sqlx::query_as(
        "SELECT member_ids,before_redirects,before_selections,post_revision FROM merge_operations WHERE id=?1")
        .bind(operation_id).fetch_optional(&mut *tx).await?;
    let (member_ids, redirects, selections, post_revision) =
        operation.ok_or_else(|| MergeError::NotFound(operation_id.into()))?;
    if post_revision != body.expected_revision {
        return Err(conflict(
            "Directory changed after this merge; automatic undo would discard later decisions",
        ));
    }
    let already_undone: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM merge_undo_operations WHERE merge_id=?1)")
            .bind(operation_id)
            .fetch_one(&mut *tx)
            .await?;
    if already_undone {
        return Err(conflict("Merge has already been undone"));
    }
    let restored_ids: Vec<String> = repo::decode(&member_ids)?;
    let previous_redirects: Vec<RedirectRow> = repo::decode(&redirects)?;
    let previous_selections: Vec<SelectionRow> = repo::decode(&selections)?;
    for id in &restored_ids {
        sqlx::query("DELETE FROM entity_redirects WHERE member_id=?1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM merge_selections WHERE canonical_id=?1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    for redirect in previous_redirects {
        sqlx::query("INSERT INTO entity_redirects(member_id,canonical_id) VALUES(?1,?2)")
            .bind(redirect.member_id)
            .bind(redirect.canonical_id)
            .execute(&mut *tx)
            .await?;
    }
    for selection in previous_selections {
        repo::put_selection(&mut tx, &selection).await?;
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO merge_undo_operations(id,merge_id,request_body,created_at) VALUES(?1,?2,?3,?4)")
        .bind(&id).bind(operation_id).bind(request_body).bind(now_rfc3339()).execute(&mut *tx).await?;
    let result = UndoResult {
        operation_id: id,
        restored_ids,
        revision: repo::revision(&mut tx).await?,
    };
    repo::save_receipt(&mut tx, "undo", &body.idempotency_key, &hash, &result).await?;
    tx.commit().await?;
    Ok(result)
}
