//! HTTP endpoints for local person overrides and contact-point preferences.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use utoipa::ToSchema;

use super::{
    model::{ContactPoint, ContactPointInput, PersonName, PersonProfile},
    repo::{self, PersonError},
};
use crate::{api::ApiError, app::AppState};

/// Local profile response; `null` means no local name override exists.
#[derive(Debug, Serialize, ToSchema)]
pub struct PersonProfileResponse {
    pub data: Option<PersonProfile>,
}

/// Contact point observations, including inactive audit values and preferred selections.
#[derive(Debug, Serialize, ToSchema)]
pub struct ContactPointListResponse {
    pub data: Vec<ContactPoint>,
}

/// A newly added explicit local point.
#[derive(Debug, Serialize, ToSchema)]
pub struct ContactPointResponse {
    pub data: ContactPoint,
}

/// Assemble person-only routes under the canonical entity ID namespace.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/{id}/person", get(get_profile).put(put_profile))
        .route(
            "/entities/{id}/contact-points",
            get(list_points).post(create_point),
        )
        .route(
            "/entities/{id}/contact-points/{point_id}/preferred",
            axum::routing::put(prefer_point),
        )
}

/// Read the independently maintained local person profile.
#[utoipa::path(get,path="/entities/{id}/person",operation_id="entities.person.get",params(("id"=String,Path)),responses((status=200,body=PersonProfileResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PersonProfileResponse>, ApiError> {
    let mut conn = state.pool.acquire().await.map_err(ApiError::database)?;
    repo::require_person(&mut conn, &id)
        .await
        .map_err(|error| person_error(error, &id))?;
    drop(conn);
    let data = repo::get_profile(&state.pool, &id)
        .await
        .map_err(ApiError::database)?;
    Ok(Json(PersonProfileResponse { data }))
}

/// Replace the local structured name without changing imported name observations.
#[utoipa::path(put,path="/entities/{id}/person",operation_id="entities.person.put",params(("id"=String,Path)),request_body=PersonName,responses((status=200,body=PersonProfileResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn put_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(name): Json<PersonName>,
) -> Result<Json<PersonProfileResponse>, ApiError> {
    let profile = repo::put_profile(&state.pool, &id, name)
        .await
        .map_err(|error| person_error(error, &id))?;
    Ok(Json(PersonProfileResponse {
        data: Some(profile),
    }))
}

/// Read all local and source points, with their provenance and preference flags.
#[utoipa::path(get,path="/entities/{id}/contact-points",operation_id="entities.points.list",params(("id"=String,Path)),responses((status=200,body=ContactPointListResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn list_points(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ContactPointListResponse>, ApiError> {
    let mut conn = state.pool.acquire().await.map_err(ApiError::database)?;
    repo::require_person(&mut conn, &id)
        .await
        .map_err(|error| person_error(error, &id))?;
    drop(conn);
    Ok(Json(ContactPointListResponse {
        data: repo::list_points(&state.pool, &id)
            .await
            .map_err(ApiError::database)?,
    }))
}

/// Add an explicit local contact point; source association is never client supplied here.
#[utoipa::path(post,path="/entities/{id}/contact-points",operation_id="entities.points.create",params(("id"=String,Path)),request_body=ContactPointInput,responses((status=201,body=ContactPointResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn create_point(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(point): Json<ContactPointInput>,
) -> Result<(StatusCode, Json<ContactPointResponse>), ApiError> {
    let mut tx = state.pool.begin().await.map_err(ApiError::database)?;
    let data = repo::insert_point(&mut tx, &id, &point, None)
        .await
        .map_err(|error| person_error(error, &id))?;
    tx.commit().await.map_err(ApiError::database)?;
    Ok((StatusCode::CREATED, Json(ContactPointResponse { data })))
}

/// Set a local preference independently of whether the source observation is still active.
#[utoipa::path(put,path="/entities/{id}/contact-points/{point_id}/preferred",operation_id="entities.points.prefer",params(("id"=String,Path),("point_id"=String,Path)),responses((status=204,description="Preference selected"),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn prefer_point(
    State(state): State<AppState>,
    Path((id, point_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    repo::prefer_point(&state.pool, &id, &point_id)
        .await
        .map_err(|error| person_error(error, &id))?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) fn person_error(error: PersonError, id: &str) -> ApiError {
    match error {
        PersonError::NotFound => ApiError::not_found("Person or contact point", id),
        PersonError::Retired(canonical) => {
            ApiError::identity_conflict("Entity ID is retired; use its canonical identity")
                .with_details(serde_json::json!({"canonicalId": canonical}))
        }
        PersonError::Invalid(message) => ApiError::bad_request(message),
        PersonError::Db(error) => ApiError::database(error),
    }
}
