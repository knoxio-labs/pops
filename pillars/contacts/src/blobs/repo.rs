//! Data access for the `blobs` table.
//!
//! A row is never updated in place — replacing an asset always inserts a new
//! row and the caller repoints its referencing column, then deletes the old
//! row (see `entities::routes`). Every query is parameterized.

use sqlx::SqlitePool;

use crate::time::now_rfc3339;

/// A stored blob's bytes and content type.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct BlobRow {
    pub id: String,
    pub content_type: String,
    pub data: Vec<u8>,
}

/// Insert a new blob and return its id, content type and byte length. A v4
/// UUID id is generated server-side.
pub async fn create(
    pool: &SqlitePool,
    content_type: &str,
    data: &[u8],
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO blobs (id, content_type, byte_length, data, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&id)
    .bind(content_type)
    .bind(data.len() as i64)
    .bind(data)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(id)
}

/// Fetch a blob's bytes and content type by id, or `None` if it does not
/// exist.
pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<BlobRow>, sqlx::Error> {
    sqlx::query_as::<_, BlobRow>("SELECT id, content_type, data FROM blobs WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Delete a blob by id. A no-op (not an error) if the id does not exist — the
/// caller uses this for best-effort cleanup of a superseded or removed asset.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM blobs WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn pool() -> SqlitePool {
        db::connect("sqlite::memory:")
            .await
            .expect("in-memory pool connects and migrates")
    }

    #[tokio::test]
    async fn create_and_get_round_trip_bytes_and_content_type() {
        let pool = pool().await;
        let id = create(&pool, "image/png", b"\x89PNG\r\n")
            .await
            .expect("create");
        let row = get(&pool, &id).await.expect("get").expect("present");
        assert_eq!(row.content_type, "image/png");
        assert_eq!(row.data, b"\x89PNG\r\n");
    }

    #[tokio::test]
    async fn get_missing_id_is_none() {
        let pool = pool().await;
        assert!(get(&pool, "nope").await.expect("get").is_none());
    }

    #[tokio::test]
    async fn delete_removes_the_row_and_is_a_noop_when_already_gone() {
        let pool = pool().await;
        let id = create(&pool, "image/png", b"x").await.expect("create");
        delete(&pool, &id).await.expect("delete");
        assert!(get(&pool, &id).await.expect("get").is_none());
        delete(&pool, &id).await.expect("delete again is a no-op");
    }

    #[tokio::test]
    async fn each_created_blob_gets_a_distinct_id() {
        let pool = pool().await;
        let a = create(&pool, "image/png", b"a").await.expect("create a");
        let b = create(&pool, "image/png", b"b").await.expect("create b");
        assert_ne!(a, b);
    }
}
