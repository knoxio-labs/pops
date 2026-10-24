//! Transaction-composable canonical resolution, revision fencing and immutable receipts.

use serde::{de::DeserializeOwned, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

use super::model::{
    IdentityGroup, RedirectRow, ResolveResponse, ResolvedIdentity, SelectionRow, SeparateList,
};

/// Identity failures are distinct from unexpected database diagnostics.
#[derive(Debug)]
pub enum MergeError {
    Invalid(String),
    NotFound(String),
    Conflict {
        message: String,
        canonical_id: Option<String>,
        revision: Option<i64>,
    },
    Db(sqlx::Error),
}

impl From<sqlx::Error> for MergeError {
    fn from(value: sqlx::Error) -> Self {
        Self::Db(value)
    }
}

/// Build a conflict without exposing database diagnostics.
pub fn conflict(message: impl Into<String>) -> MergeError {
    MergeError::Conflict {
        message: message.into(),
        canonical_id: None,
        revision: None,
    }
}

/// Read the monotonic directory-wide revision inside the caller's transaction.
pub async fn revision(conn: &mut SqliteConnection) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT revision FROM contact_directory_revision WHERE singleton=1")
        .fetch_one(conn)
        .await
}

/// Resolve one retained entity ID. A missing ID is not a transport failure.
pub async fn resolve_one(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(r.canonical_id,e.id) FROM entities e LEFT JOIN entity_redirects r ON r.member_id=e.id WHERE e.id=?1",
    )
    .bind(id)
    .fetch_optional(conn)
    .await
}

/// Resolve every requested ID from one snapshot, preserving order, duplicates and missing IDs.
pub async fn resolve_many(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<ResolveResponse, MergeError> {
    if ids.len() > 500 || ids.iter().any(|id| id.is_empty() || id.len() > 1024) {
        return Err(MergeError::Invalid(
            "Resolve accepts at most 500 nonempty IDs".into(),
        ));
    }
    let mut tx = pool.begin().await?;
    let revision = revision(&mut tx).await?;
    let mut data = Vec::with_capacity(ids.len());
    for id in ids {
        data.push(ResolvedIdentity {
            id: id.clone(),
            canonical_id: resolve_one(&mut tx, id).await?,
        });
    }
    tx.commit().await?;
    Ok(ResolveResponse { data, revision })
}

/// Return every original member of an existing canonical root in deterministic order.
pub async fn members(
    conn: &mut SqliteConnection,
    canonical: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT id FROM entities WHERE id=?1 OR id IN (SELECT member_id FROM entity_redirects WHERE canonical_id=?1) ORDER BY id",
    )
    .bind(canonical)
    .fetch_all(conn)
    .await
}

/// Read a consistent canonical group and optimistic revision, accepting a historical ID.
pub async fn group(pool: &SqlitePool, id: &str) -> Result<IdentityGroup, MergeError> {
    let mut tx = pool.begin().await?;
    let revision = revision(&mut tx).await?;
    let canonical_id = resolve_one(&mut tx, id)
        .await?
        .ok_or_else(|| MergeError::NotFound(id.into()))?;
    let member_ids = members(&mut tx, &canonical_id).await?;
    tx.commit().await?;
    Ok(IdentityGroup {
        canonical_id,
        member_ids,
        revision,
    })
}

/// Reject stale optimistic input while the caller holds SQLite's write reservation.
pub async fn expect_revision(conn: &mut SqliteConnection, expected: i64) -> Result<(), MergeError> {
    let current = revision(conn).await?;
    if current != expected {
        return Err(MergeError::Conflict {
            message: "Directory changed; refresh the decision before retrying".into(),
            canonical_id: None,
            revision: Some(current),
        });
    }
    Ok(())
}

/// Require a current canonical person; a retired ID is an explicit conflict.
pub async fn require_root(conn: &mut SqliteConnection, id: &str) -> Result<(), MergeError> {
    let canonical = resolve_one(conn, id)
        .await?
        .ok_or_else(|| MergeError::NotFound(id.into()))?;
    if canonical != id {
        return Err(MergeError::Conflict {
            message: "Entity ID is retired; use its canonical identity".into(),
            canonical_id: Some(canonical),
            revision: None,
        });
    }
    let ty: String = sqlx::query_scalar("SELECT type FROM entities WHERE id=?1")
        .bind(id)
        .fetch_one(conn)
        .await?;
    if ty != "person" {
        return Err(MergeError::Invalid(
            "Only person identities may be merged".into(),
        ));
    }
    Ok(())
}

/// Read selections belonging to a current root.
pub async fn selections(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Vec<SelectionRow>, sqlx::Error> {
    sqlx::query_as("SELECT canonical_id,field,owner_entity_id,point_id FROM merge_selections WHERE canonical_id=?1 ORDER BY field")
        .bind(id).fetch_all(conn).await
}

/// Store an explicitly validated projection selection without changing original observations.
pub async fn put_selection(
    conn: &mut SqliteConnection,
    row: &SelectionRow,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO merge_selections(canonical_id,field,owner_entity_id,point_id) VALUES(?1,?2,?3,?4) ON CONFLICT(canonical_id,field) DO UPDATE SET owner_entity_id=excluded.owner_entity_id,point_id=excluded.point_id")
        .bind(&row.canonical_id).bind(&row.field).bind(&row.owner_entity_id).bind(&row.point_id)
        .execute(conn).await?;
    Ok(())
}

/// Read a member's previous redirect for an immutable undo snapshot.
pub async fn redirect(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<RedirectRow>, sqlx::Error> {
    sqlx::query_as("SELECT member_id,canonical_id FROM entity_redirects WHERE member_id=?1")
        .bind(id)
        .fetch_optional(conn)
        .await
}

/// Read current keep-separate pairs from one snapshot.
pub async fn separate_pairs(pool: &SqlitePool) -> Result<SeparateList, MergeError> {
    let mut tx = pool.begin().await?;
    let revision = revision(&mut tx).await?;
    let data =
        sqlx::query_as("SELECT left_id,right_id FROM keep_separate ORDER BY left_id,right_id")
            .fetch_all(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(SeparateList { data, revision })
}

/// Decode an immutable receipt, rejecting reuse of a key with a different request.
pub async fn receipt<T: DeserializeOwned>(
    conn: &mut SqliteConnection,
    action: &str,
    key: &str,
    body_hash: &str,
) -> Result<Option<T>, MergeError> {
    let stored: Option<(String, String)> = sqlx::query_as(
        "SELECT body_hash,response FROM identity_receipts WHERE action=?1 AND idempotency_key=?2",
    )
    .bind(action)
    .bind(key)
    .fetch_optional(conn)
    .await?;
    match stored {
        Some((hash, response)) if hash == body_hash => Ok(Some(decode(&response)?)),
        Some(_) => Err(conflict(
            "Idempotency key was already used for another request",
        )),
        None => Ok(None),
    }
}

/// Record a successful mutation and its response in the same transaction.
pub async fn save_receipt<T: Serialize>(
    conn: &mut SqliteConnection,
    action: &str,
    key: &str,
    hash: &str,
    response: &T,
) -> Result<(), MergeError> {
    sqlx::query("INSERT INTO identity_receipts(action,idempotency_key,body_hash,response) VALUES(?1,?2,?3,?4)")
        .bind(action).bind(key).bind(hash).bind(encode(response)?).execute(conn).await?;
    Ok(())
}

/// Encode typed audit evidence without a lossy or untyped conversion.
pub fn encode<T: Serialize>(value: &T) -> Result<String, sqlx::Error> {
    serde_json::to_string(value).map_err(|error| sqlx::Error::Encode(Box::new(error)))
}

/// Decode retained typed audit evidence; corruption is an internal failure.
pub fn decode<T: DeserializeOwned>(value: &str) -> Result<T, sqlx::Error> {
    serde_json::from_str(value).map_err(|error| sqlx::Error::Decode(Box::new(error)))
}
