//! Stable-member separation decisions survive regrouping, undo and source replay.

use sqlx::SqlitePool;

use super::model::{SeparateBody, SeparateResult};
use super::repo::{self, conflict, MergeError};
use super::service::validate_decision;
use crate::{digest::sha256_hex, time::now_rfc3339};

/// Apply a candidate-specific decision to every current cross-group member pair.
/// Unselected candidates and their source records are never modified.
pub async fn decide(
    pool: &SqlitePool,
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
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some(result) = repo::receipt(&mut tx, "separate", &body.idempotency_key, &hash).await? {
        tx.commit().await?;
        return Ok(result);
    }
    repo::expect_revision(&mut tx, body.expected_revision).await?;
    let left = repo::resolve_one(&mut tx, &body.left_id)
        .await?
        .ok_or_else(|| MergeError::NotFound(body.left_id.clone()))?;
    let right = repo::resolve_one(&mut tx, &body.right_id)
        .await?
        .ok_or_else(|| MergeError::NotFound(body.right_id.clone()))?;
    repo::require_root(&mut tx, &left).await?;
    repo::require_root(&mut tx, &right).await?;
    if left == right && body.keep_separate {
        return Err(conflict(
            "Undo the merge before separating members of the same group",
        ));
    }
    let left_members = repo::members(&mut tx, &left).await?;
    let right_members = repo::members(&mut tx, &right).await?;
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
                    .bind(first).bind(second).execute(&mut *tx).await?;
            } else {
                sqlx::query("DELETE FROM keep_separate WHERE left_id=?1 AND right_id=?2")
                    .bind(first)
                    .bind(second)
                    .execute(&mut *tx)
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
    .execute(&mut *tx)
    .await?;
    let result = SeparateResult {
        left_id: body.left_id,
        right_id: body.right_id,
        keep_separate: body.keep_separate,
        revision: repo::revision(&mut tx).await?,
    };
    repo::save_receipt(&mut tx, "separate", &body.idempotency_key, &hash, &result).await?;
    tx.commit().await?;
    Ok(result)
}
