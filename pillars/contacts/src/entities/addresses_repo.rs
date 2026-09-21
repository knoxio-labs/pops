//! Data access for an entity's addresses (ADR-053).
//!
//! Every query is parameterized. Emptiness of `value` is rejected at the
//! route layer (`addresses_routes.rs`), matching `entities::routes::create`'s
//! own convention for `name` — the repo layer assumes a body that already
//! passed that check.

use sqlx::SqlitePool;

use crate::time::now_rfc3339;

use super::addresses_model::{AddressRow, CreateAddressBody};

/// List every address recorded against `entity_id`, oldest first. An entity
/// with none returns an empty vector, never an error.
pub async fn list_for_entity(pool: &SqlitePool, entity_id: &str) -> sqlx::Result<Vec<AddressRow>> {
    sqlx::query_as::<_, AddressRow>(
        "SELECT id, entity_id, value, last_edited_time FROM entity_addresses \
         WHERE entity_id = ?1 ORDER BY last_edited_time ASC",
    )
    .bind(entity_id)
    .fetch_all(pool)
    .await
}

/// Insert a new address under `entity_id`. A v4 UUID id and the current
/// `last_edited_time` are generated server-side.
///
/// `entity_id` referencing no entity surfaces as the underlying foreign-key
/// violation (`sqlx::Error`) — the pool runs with `foreign_keys = ON`
/// (`db.rs`), so this never silently orphans a row. Callers that want a
/// clean 404 instead check [`get_entity_exists`] first, the same order
/// `entities::routes::upload_avatar` checks existence before writing.
pub async fn create(
    pool: &SqlitePool,
    entity_id: &str,
    body: CreateAddressBody,
) -> sqlx::Result<AddressRow> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    sqlx::query(
        "INSERT INTO entity_addresses (id, entity_id, value, last_edited_time) \
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&id)
    .bind(entity_id)
    .bind(&body.value)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(AddressRow {
        id,
        entity_id: entity_id.to_string(),
        value: body.value,
        last_edited_time: now,
    })
}

/// Whether `entity_id` names a row in `entities` — the existence check the
/// route layer uses to answer 404 before either listing or writing.
pub async fn get_entity_exists(pool: &SqlitePool, entity_id: &str) -> sqlx::Result<bool> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM entities WHERE id = ?1")
        .bind(entity_id)
        .fetch_optional(pool)
        .await?;
    Ok(exists.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::model::CreateEntityBody;
    use crate::entities::repo as entities_repo;

    async fn pool() -> SqlitePool {
        crate::db::connect("sqlite::memory:")
            .await
            .expect("in-memory pool for addresses repo tests")
    }

    async fn seed_entity(pool: &SqlitePool, name: &str) -> String {
        let body = CreateEntityBody {
            name: name.to_string(),
            r#type: None,
            abn: None,
            aliases: Vec::new(),
            default_transaction_type: None,
            default_tags: Vec::new(),
            notes: None,
        };
        entities_repo::create(pool, body)
            .await
            .expect("seed entity")
            .id
    }

    #[tokio::test]
    async fn create_then_list_returns_the_address() {
        let pool = pool().await;
        let entity_id = seed_entity(&pool, "Woolworths").await;

        let created = create(
            &pool,
            &entity_id,
            CreateAddressBody {
                value: "12 Example St".to_string(),
            },
        )
        .await
        .expect("create address");
        assert_eq!(created.value, "12 Example St");
        assert_eq!(created.entity_id, entity_id);

        let rows = list_for_entity(&pool, &entity_id).await.expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, created.id);
    }

    #[tokio::test]
    async fn create_against_missing_entity_errors() {
        let pool = pool().await;
        let result = create(
            &pool,
            "does-not-exist",
            CreateAddressBody {
                value: "12 Example St".to_string(),
            },
        )
        .await;
        assert!(
            result.is_err(),
            "a foreign-key violation must surface as an error"
        );
    }

    #[tokio::test]
    async fn list_for_entity_with_none_returns_empty() {
        let pool = pool().await;
        let entity_id = seed_entity(&pool, "Coles").await;
        let rows = list_for_entity(&pool, &entity_id).await.expect("list");
        assert!(
            rows.is_empty(),
            "an entity with no addresses must list empty, not error"
        );
    }

    #[tokio::test]
    async fn get_entity_exists_reports_presence() {
        let pool = pool().await;
        let entity_id = seed_entity(&pool, "Aldi").await;
        assert!(get_entity_exists(&pool, &entity_id).await.expect("exists"));
        assert!(!get_entity_exists(&pool, "unknown").await.expect("exists"));
    }
}
