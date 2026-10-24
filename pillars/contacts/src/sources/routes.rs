//! Source account metadata and provenance reads; write orchestration uses the transaction repository.

use axum::{
    extract::{rejection::JsonRejection, Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use utoipa::ToSchema;

use super::{
    model::{SourceAccount, SourceAccountInput, SourceRecord},
    repo::{self, SourceError},
};
use crate::{api::ApiError, app::AppState, persons};

/// Registered provider-account namespaces, without credentials.
#[derive(Debug, Serialize, ToSchema)]
pub struct SourceAccountListResponse {
    pub data: Vec<SourceAccount>,
}

/// Stable account namespace resulting from create-or-fetch registration.
#[derive(Debug, Serialize, ToSchema)]
pub struct SourceAccountResponse {
    pub data: SourceAccount,
}

/// Active and inactive external records linked to a person.
#[derive(Debug, Serialize, ToSchema)]
pub struct SourceRecordListResponse {
    pub data: Vec<SourceRecord>,
}

/// Assemble source metadata routes. Import/provider services own observation mutations.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/sources/accounts",
            get(list_accounts).post(register_account),
        )
        .route("/entities/{id}/sources", get(list_records))
}

/// List registered account identities without credential material.
#[utoipa::path(get,path="/sources/accounts",operation_id="sources.accounts.list",responses((status=200,body=SourceAccountListResponse)))]
pub async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<SourceAccountListResponse>, ApiError> {
    Ok(Json(SourceAccountListResponse {
        data: repo::list_accounts(&state.pool)
            .await
            .map_err(ApiError::database)?,
    }))
}

/// Register or relabel an existing provider subject without changing its identity.
#[utoipa::path(post,path="/sources/accounts",operation_id="sources.accounts.register",request_body=SourceAccountInput,responses((status=200,body=SourceAccountResponse),(status=400,body=crate::api::ErrorBody)))]
pub async fn register_account(
    State(state): State<AppState>,
    body: Result<Json<SourceAccountInput>, JsonRejection>,
) -> Result<(StatusCode, Json<SourceAccountResponse>), ApiError> {
    let Json(input) = body.map_err(|_| ApiError::bad_request("Invalid source account metadata"))?;
    let data = repo::create_or_get_account(&state.pool, &input)
        .await
        .map_err(source_error)?;
    Ok((StatusCode::OK, Json(SourceAccountResponse { data })))
}

/// List provenance for one canonical person, including inactive sources.
#[utoipa::path(get,path="/entities/{id}/sources",operation_id="entities.sources.list",params(("id"=String,Path)),responses((status=200,body=SourceRecordListResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn list_records(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceRecordListResponse>, ApiError> {
    let mut conn = state.pool.acquire().await.map_err(ApiError::database)?;
    persons::repo::require_person(&mut conn, &id)
        .await
        .map_err(|error| persons::routes::person_error(error, &id))?;
    drop(conn);
    Ok(Json(SourceRecordListResponse {
        data: repo::list_records(&state.pool, &id)
            .await
            .map_err(ApiError::database)?,
    }))
}

fn source_error(error: SourceError) -> ApiError {
    match error {
        SourceError::NotFound => ApiError::not_found("Source account or person", "unknown"),
        SourceError::Invalid(message) => ApiError::bad_request(message),
        SourceError::Conflict => {
            ApiError::conflict("Source record is already linked to another person")
        }
        SourceError::Db(error) => ApiError::database(error),
    }
}
