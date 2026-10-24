//! Transaction-level person profile and point persistence.

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{ContactPoint, ContactPointInput, NameCompleteness, PersonName, PersonProfile};
use crate::time::now_rfc3339;

/// Failures of person writes, separate from database diagnostics.
#[derive(Debug)]
pub enum PersonError {
    NotFound,
    Retired(String),
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for PersonError {
    fn from(value: sqlx::Error) -> Self {
        Self::Db(value)
    }
}

/// Require an existing person entity before reading or attaching person-only data.
pub async fn require_person(conn: &mut SqliteConnection, id: &str) -> Result<(), PersonError> {
    let ty: Option<String> = sqlx::query_scalar("SELECT type FROM entities WHERE id = ?1")
        .bind(id)
        .fetch_optional(conn)
        .await?;
    match ty.as_deref() {
        None => Err(PersonError::NotFound),
        Some("person") => Ok(()),
        Some(_) => Err(PersonError::Invalid("Entity must be a person".to_string())),
    }
}

/// Require a current canonical person for local edits and new source links; recognized source refreshes retain their original owner.
pub async fn require_writable_person(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<(), PersonError> {
    require_person(conn, id).await?;
    if let Some(canonical) = crate::merges::repo::resolve_one(conn, id).await? {
        if canonical != id {
            return Err(PersonError::Retired(canonical));
        }
    }
    Ok(())
}

/// Validate bounded structured name input. Display text cannot establish complete name evidence.
pub fn validate_name(name: &PersonName) -> Result<(), PersonError> {
    for value in [
        &name.given_name,
        &name.additional_names,
        &name.family_name,
        &name.name_prefix,
        &name.name_suffix,
    ]
    .into_iter()
    .flatten()
    {
        if value.trim().is_empty() || value.len() > 1024 {
            return Err(PersonError::Invalid(
                "Name parts must be nonempty and at most 1024 bytes".to_string(),
            ));
        }
    }
    if name.completeness == NameCompleteness::Complete
        && (name.given_name.is_none() || name.family_name.is_none())
    {
        return Err(PersonError::Invalid(
            "Complete names require given and family names".to_string(),
        ));
    }
    Ok(())
}

/// Read the local structured-name override; an untouched person has no profile.
pub async fn get_profile(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<PersonProfile>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let profile = get_profile_in_transaction(&mut tx, id).await?;
    tx.commit().await?;
    Ok(profile)
}

/// Read the selected local or immutable imported profile within the caller's consistent snapshot.
pub async fn get_profile_in_transaction(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<PersonProfile>, sqlx::Error> {
    if let Some(profile) = crate::merges::projection::source_profile(conn, id).await? {
        return Ok(Some(profile));
    }
    let owner = crate::merges::projection::profile_owner(conn, id).await?;
    get_stored_profile(conn, &owner).await
}

/// Read one retained member's original local name inside the caller's snapshot, without canonical projection.
pub async fn get_stored_profile(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<PersonProfile>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as("SELECT json_object('entityId', entity_id, 'name', json_object('givenName', given_name, 'additionalNames', additional_names, 'familyName', family_name, 'namePrefix', name_prefix, 'nameSuffix', name_suffix, 'completeness', name_completeness), 'updatedAt', updated_at) FROM person_profiles WHERE entity_id = ?1")
        .bind(id).fetch_optional(conn).await?;
    row.map(|(json,)| {
        serde_json::from_str(&json).map_err(|error| sqlx::Error::Decode(Box::new(error)))
    })
    .transpose()
}

/// Replace only the local name override; source observations and entity display name remain independent.
pub async fn put_profile(
    pool: &SqlitePool,
    id: &str,
    name: PersonName,
) -> Result<PersonProfile, PersonError> {
    validate_name(&name)?;
    let mut tx = pool.begin().await?;
    require_writable_person(&mut tx, id).await?;
    let now = now_rfc3339();
    sqlx::query("INSERT INTO person_profiles(entity_id, given_name, additional_names, family_name, name_prefix, name_suffix, name_completeness, updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(entity_id) DO UPDATE SET given_name=excluded.given_name, additional_names=excluded.additional_names, family_name=excluded.family_name, name_prefix=excluded.name_prefix, name_suffix=excluded.name_suffix, name_completeness=excluded.name_completeness, updated_at=excluded.updated_at")
        .bind(id).bind(&name.given_name).bind(&name.additional_names).bind(&name.family_name).bind(&name.name_prefix).bind(&name.name_suffix).bind(name.completeness.as_str()).bind(&now).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(PersonProfile {
        entity_id: id.to_string(),
        name,
        updated_at: now,
        source_record_id: None,
        source_observation_id: None,
    })
}

/// List current point observations plus explicit preferences retained after upstream removal.
pub async fn list_points(pool: &SqlitePool, id: &str) -> Result<Vec<ContactPoint>, sqlx::Error> {
    crate::merges::projection::points(pool, id).await
}

/// Validate a point observation before any source refresh mutates stored data.
pub fn validate_point(point: &ContactPointInput) -> Result<(), PersonError> {
    if let Some(country) = &point.country_code {
        if point.kind != super::model::ContactPointKind::Phone
            || crate::identity::normalize::phone_country(country).is_none()
        {
            return Err(PersonError::Invalid(
                "Country context requires a known ISO country code on a phone point".to_string(),
            ));
        }
    }

    if point.value.trim().is_empty()
        || point.value.len() > 4096
        || point.label.as_ref().is_some_and(|label| label.len() > 256)
    {
        return Err(PersonError::Invalid(
            "Point value must be nonempty and at most 4096 bytes; label at most 256 bytes"
                .to_string(),
        ));
    }
    Ok(())
}

/// Insert a point inside the caller's transaction. Source ownership is enforced by SQLite.
pub async fn insert_point(
    conn: &mut SqliteConnection,
    id: &str,
    point: &ContactPointInput,
    source_record_id: Option<&str>,
) -> Result<ContactPoint, PersonError> {
    validate_point(point)?;
    if source_record_id.is_none() {
        require_writable_person(conn, id).await?;
    } else {
        require_person(conn, id).await?;
    }
    let point_id = uuid::Uuid::new_v4().to_string();
    let normalized = match point.kind {
        super::model::ContactPointKind::Email => crate::identity::normalize_email(&point.value),
        super::model::ContactPointKind::Phone => match &point.country_code {
            Some(country) => crate::identity::normalize_phone_for_country(&point.value, country),
            None => crate::identity::normalize_phone(&point.value),
        },
        super::model::ContactPointKind::Social | super::model::ContactPointKind::Url => None,
    };
    let now = now_rfc3339();
    sqlx::query("INSERT INTO contact_points(id,entity_id,kind,value,normalized_value,label,country_code,source_record_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)")
        .bind(&point_id).bind(id).bind(point.kind.as_str()).bind(&point.value).bind(&normalized).bind(&point.label).bind(&point.country_code).bind(source_record_id).bind(&now).execute(conn).await?;
    Ok(ContactPoint {
        id: point_id,
        entity_id: id.to_string(),
        kind: point.kind.as_str().to_string(),
        value: point.value.clone(),
        normalized_value: normalized,
        label: point.label.clone(),
        country_code: point.country_code.clone(),
        source_record_id: source_record_id.map(str::to_string),
        active: true,
        preferred: false,
        created_at: now,
    })
}

/// Select one point for a person/kind atomically. A point belonging to another person is never selected.
pub async fn prefer_point(pool: &SqlitePool, id: &str, point_id: &str) -> Result<(), PersonError> {
    let mut tx = pool.begin().await?;
    require_writable_person(&mut tx, id).await?;
    if !crate::merges::projection::prefer_point(&mut tx, id, point_id).await? {
        return Err(PersonError::NotFound);
    }
    tx.commit().await?;
    Ok(())
}

/// Create a canonical person inside the caller's transaction, preserving atomic import commits.
/// Structured names remain source observations until the caller explicitly creates a local override.
pub async fn create_person(
    conn: &mut SqliteConnection,
    display_name: &str,
) -> Result<String, PersonError> {
    if display_name.trim().is_empty() || display_name.len() > 1024 {
        return Err(PersonError::Invalid(
            "Person display name must be nonempty and at most 1024 bytes".to_string(),
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO entities(id,name,type,colour,last_edited_time) VALUES(?1,?2,'person',?3,?4)",
    )
    .bind(&id)
    .bind(display_name)
    .bind(crate::entities::colours::random_colour())
    .bind(now_rfc3339())
    .execute(conn)
    .await?;
    Ok(id)
}
