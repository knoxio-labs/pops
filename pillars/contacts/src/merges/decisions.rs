//! Stable-member separation decisions survive regrouping, undo and source replay.

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{SeparateBody, SeparateResult};
use super::repo::{self, conflict, MergeError};
use super::service::validate_decision;
use crate::{digest::sha256_hex, time::now_rfc3339};

/// Apply a candidate-specific decision to every current cross-group member pair.
/// Unselected candidates and their source records are never modified.
pub async fn decide(pool: &SqlitePool, body: SeparateBody) -> Result<SeparateResult, MergeError> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let result = decide_in_transaction(&mut tx, body).await?;
    tx.commit().await?;
    Ok(result)
}

/// Record separation inside the caller's reserved write transaction without committing it.
/// A later failure must roll back the whole caller transaction; apply composite rejection decisions before its merge.
pub async fn decide_in_transaction(
    conn: &mut SqliteConnection,
    mut body: SeparateBody,
) -> Result<SeparateResult, MergeError> {
    validate_decision(&body.idempotency_key, &body.evidence)?;
    if body.left_id == body.right_id {
        return Err(MergeError::Invalid(
            "Separation requires distinct identities".into(),
        ));
    }
    if body.left_id > body.right_id {
        std::mem::swap(&mut body.left_id, &mut body.right_id);
    }
    let request_body = repo::encode(&body)?;
    let hash = sha256_hex(request_body.as_bytes());
    if let Some(result) = repo::receipt(conn, "separate", &body.idempotency_key, &hash).await? {
        return Ok(result);
    }
    repo::expect_revision(conn, body.expected_revision).await?;
    let left = repo::resolve_one(conn, &body.left_id)
        .await?
        .ok_or_else(|| MergeError::NotFound(body.left_id.clone()))?;
    let right = repo::resolve_one(conn, &body.right_id)
        .await?
        .ok_or_else(|| MergeError::NotFound(body.right_id.clone()))?;
    repo::require_root(conn, &left).await?;
    repo::require_root(conn, &right).await?;
    if left == right && body.keep_separate {
        return Err(conflict(
            "Undo the merge before separating members of the same group",
        ));
    }
    let left_members = repo::members(conn, &left).await?;
    let right_members = repo::members(conn, &right).await?;
    if left_members.len().saturating_mul(right_members.len()) > 10_000 {
        return Err(MergeError::Invalid(
            "Separation decision exceeds 10000 stable member pairs".into(),
        ));
    }
    for left_id in &left_members {
        for right_id in &right_members {
            if left_id == right_id {
                continue;
            }
            let (first, second) = if left_id < right_id {
                (left_id, right_id)
            } else {
                (right_id, left_id)
            };
            if body.keep_separate {
                sqlx::query("INSERT INTO keep_separate(left_id,right_id) VALUES(?1,?2) ON CONFLICT DO NOTHING")
                    .bind(first).bind(second).execute(&mut *conn).await?;
            } else {
                sqlx::query("DELETE FROM keep_separate WHERE left_id=?1 AND right_id=?2")
                    .bind(first)
                    .bind(second)
                    .execute(&mut *conn)
                    .await?;
            }
        }
    }
    sqlx::query(
        "INSERT INTO identity_decision_events(id,request_body,created_at) VALUES(?1,?2,?3)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(request_body)
    .bind(now_rfc3339())
    .execute(&mut *conn)
    .await?;
    let result = SeparateResult {
        left_id: body.left_id,
        right_id: body.right_id,
        keep_separate: body.keep_separate,
        revision: repo::revision(conn).await?,
    };
    repo::save_receipt(conn, "separate", &body.idempotency_key, &hash, &result).await?;
    Ok(result)
}
