//! Source observation writes composable inside import and provider transactions.

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{SourceAccount, SourceAccountInput, SourceRecord, SourceRecordInput};
use crate::persons::model::{ContactPoint, ContactPointInput};
use crate::persons::repo::{
    insert_point, require_person, validate_name, validate_point, PersonError,
};
use crate::time::now_rfc3339;

/// Validated source failures; namespace conflicts never silently reassign an observation.
#[derive(Debug)]
pub enum SourceError {
    NotFound,
    Invalid(String),
    Conflict,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for SourceError {
    fn from(value: sqlx::Error) -> Self {
        Self::Db(value)
    }
}

impl From<PersonError> for SourceError {
    fn from(value: PersonError) -> Self {
        match value {
            PersonError::NotFound => Self::NotFound,
            PersonError::Invalid(message) => Self::Invalid(message),
            PersonError::Db(error) => Self::Db(error),
        }
    }
}

fn validate_key(value: &str) -> Result<(), SourceError> {
    if value.trim().is_empty() || value.len() > 1024 {
        return Err(SourceError::Invalid(
            "Source keys must be nonempty and at most 1024 bytes".to_string(),
        ));
    }
    Ok(())
}

/// Create or fetch an account by stable provider subject. A supplied label updates its label;
/// omitting the optional label preserves the stored label.
pub async fn create_or_get_account(
    pool: &SqlitePool,
    input: &SourceAccountInput,
) -> Result<SourceAccount, SourceError> {
    validate_key(&input.provider)?;
    validate_key(&input.account_key)?;
    if input.label.as_ref().is_some_and(|label| label.len() > 256) {
        return Err(SourceError::Invalid(
            "Account label must be at most 256 bytes".to_string(),
        ));
    }
    sqlx::query("INSERT INTO source_accounts(id,provider,account_key,label,created_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(provider,account_key) DO UPDATE SET label=excluded.label WHERE excluded.label IS NOT NULL AND source_accounts.label IS NOT excluded.label")
        .bind(uuid::Uuid::new_v4().to_string()).bind(&input.provider).bind(&input.account_key).bind(&input.label).bind(now_rfc3339()).execute(pool).await?;
    Ok(sqlx::query_as("SELECT id,provider,account_key,label,created_at FROM source_accounts WHERE provider=?1 AND account_key=?2")
        .bind(&input.provider).bind(&input.account_key).fetch_one(pool).await?)
}

/// List account metadata without provider credentials.
pub async fn list_accounts(pool: &SqlitePool) -> Result<Vec<SourceAccount>, sqlx::Error> {
    sqlx::query_as("SELECT id,provider,account_key,label,created_at FROM source_accounts ORDER BY provider,account_key")
        .fetch_all(pool).await
}

/// List all source links for a person, including deactivated records retained for audit.
pub async fn list_records(
    pool: &SqlitePool,
    entity_id: &str,
) -> Result<Vec<SourceRecord>, sqlx::Error> {
    sqlx::query_as("SELECT id,account_id,collection_key,record_key,entity_id,display_name,given_name,additional_names,family_name,name_prefix,name_suffix,name_completeness,active,last_seen_at,revision FROM source_records WHERE entity_id=?1 ORDER BY account_id,collection_key,record_key")
        .bind(entity_id).fetch_all(pool).await
}

/// Validate a complete observation before a transaction changes prior observations.
pub fn validate_record(input: &SourceRecordInput) -> Result<(), SourceError> {
    validate_key(&input.account_id)?;
    validate_key(&input.collection_key)?;
    validate_key(&input.record_key)?;
    validate_name(&input.name)?;
    if input
        .display_name
        .as_ref()
        .is_some_and(|name| name.len() > 1024)
        || input.points.len() > 200
    {
        return Err(SourceError::Invalid(
            "Display name must be at most 1024 bytes and records may contain at most 200 points"
                .to_string(),
        ));
    }
    for point in &input.points {
        validate_point(point)?;
    }
    Ok(())
}

/// Replace one source record's observations in the caller's transaction without committing it.
/// Local points/profile and existing preferred selections survive. Unchanged points retain their IDs;
/// removed source values remain inactive.
/// Reusing a namespace for a different canonical person is an explicit conflict.
/// Reapplying an identical active observation performs no writes and keeps its revision.
pub async fn apply_record(
    conn: &mut SqliteConnection,
    input: &SourceRecordInput,
) -> Result<SourceRecord, SourceError> {
    validate_record(input)?;
    require_person(conn, &input.entity_id).await?;
    let account_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM source_accounts WHERE id=?1)")
            .bind(&input.account_id)
            .fetch_one(&mut *conn)
            .await?;
    if !account_exists {
        return Err(SourceError::NotFound);
    }
    let snapshot = serde_json::to_string(input)
        .map_err(|error| SourceError::Db(sqlx::Error::Encode(Box::new(error))))?;
    let existing = find_record(
        conn,
        &input.account_id,
        &input.collection_key,
        &input.record_key,
    )
    .await?;
    let id = match existing {
        Some(record) if record.entity_id == input.entity_id => {
            if record.active {
                let prior: Option<String> = sqlx::query_scalar("SELECT observation FROM source_record_history WHERE source_record_id=?1 ORDER BY rowid DESC LIMIT 1")
                    .bind(&record.id).fetch_optional(&mut *conn).await?;
                if prior.as_deref() == Some(snapshot.as_str()) {
                    return Ok(record);
                }
            }
            record.id
        }
        Some(_) => return Err(SourceError::Conflict),
        None => uuid::Uuid::new_v4().to_string(),
    };
    let now = now_rfc3339();
    sqlx::query("INSERT INTO source_records(id,account_id,collection_key,record_key,entity_id,display_name,given_name,additional_names,family_name,name_prefix,name_suffix,name_completeness,active,last_seen_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13) ON CONFLICT(account_id,collection_key,record_key) DO UPDATE SET display_name=excluded.display_name,given_name=excluded.given_name,additional_names=excluded.additional_names,family_name=excluded.family_name,name_prefix=excluded.name_prefix,name_suffix=excluded.name_suffix,name_completeness=excluded.name_completeness,active=1,last_seen_at=excluded.last_seen_at,revision=source_records.revision+1")
        .bind(&id).bind(&input.account_id).bind(&input.collection_key).bind(&input.record_key).bind(&input.entity_id).bind(&input.display_name).bind(&input.name.given_name).bind(&input.name.additional_names).bind(&input.name.family_name).bind(&input.name.name_prefix).bind(&input.name.name_suffix).bind(input.name.completeness.as_str()).bind(&now).execute(&mut *conn).await?;
    refresh_points(conn, &input.entity_id, &id, &input.points).await?;
    sqlx::query("INSERT INTO source_record_history(id,source_record_id,observed_at,observation) VALUES(?1,?2,?3,?4)")
        .bind(uuid::Uuid::new_v4().to_string()).bind(&id).bind(&now).bind(snapshot).execute(&mut *conn).await?;
    Ok(sqlx::query_as("SELECT id,account_id,collection_key,record_key,entity_id,display_name,given_name,additional_names,family_name,name_prefix,name_suffix,name_completeness,active,last_seen_at,revision FROM source_records WHERE id=?1")
        .bind(id).fetch_one(conn).await?)
}

async fn refresh_points(
    conn: &mut SqliteConnection,
    entity_id: &str,
    source_id: &str,
    points: &[ContactPointInput],
) -> Result<(), SourceError> {
    let mut prior: Vec<ContactPoint> = sqlx::query_as("SELECT id,entity_id,kind,value,normalized_value,label,country_code,source_record_id,active,preferred,created_at FROM contact_points WHERE source_record_id=?1 AND (active=1 OR preferred=1) ORDER BY preferred DESC,active DESC,created_at,id")
        .bind(source_id).fetch_all(&mut *conn).await?;
    for point in points {
        let position = prior.iter().position(|old| {
            old.kind == point.kind.as_str()
                && old.value == point.value
                && old.label == point.label
                && old.country_code == point.country_code
        });
        match position {
            Some(position) => {
                let old = prior.remove(position);
                if !old.active {
                    sqlx::query("UPDATE contact_points SET active=1 WHERE id=?1")
                        .bind(old.id)
                        .execute(&mut *conn)
                        .await?;
                }
            }
            None => {
                insert_point(conn, entity_id, point, Some(source_id)).await?;
            }
        }
    }
    for removed in prior.into_iter().filter(|point| point.active) {
        sqlx::query("UPDATE contact_points SET active=0 WHERE id=?1")
            .bind(removed.id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// Deactivate one source and its observations without deleting people or clearing preferred/local values.
/// This method participates in the caller's transaction and never commits independently.
pub async fn deactivate_record(conn: &mut SqliteConnection, id: &str) -> Result<bool, SourceError> {
    let active: Option<bool> = sqlx::query_scalar("SELECT active FROM source_records WHERE id=?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(active) = active else {
        return Ok(false);
    };
    if !active {
        return Ok(true);
    }
    sqlx::query("UPDATE source_records SET active=0,revision=revision+1 WHERE id=?1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    sqlx::query("UPDATE contact_points SET active=0 WHERE source_record_id=?1 AND active=1")
        .bind(id)
        .execute(conn)
        .await?;
    Ok(true)
}

/// Read one source namespace inside a caller transaction for optimistic revision checks.
pub async fn find_record(
    conn: &mut SqliteConnection,
    account_id: &str,
    collection_key: &str,
    record_key: &str,
) -> Result<Option<SourceRecord>, SourceError> {
    Ok(sqlx::query_as("SELECT id,account_id,collection_key,record_key,entity_id,display_name,given_name,additional_names,family_name,name_prefix,name_suffix,name_completeness,active,last_seen_at,revision FROM source_records WHERE account_id=?1 AND collection_key=?2 AND record_key=?3")
        .bind(account_id).bind(collection_key).bind(record_key).fetch_optional(conn).await?)
}
