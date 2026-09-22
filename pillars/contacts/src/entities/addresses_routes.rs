//! Axum routes for an entity's addresses (ADR-053).
//!
//! Same dotted-`operationId` discipline as `entities::routes`:
//! `entities.addresses.list` / `entities.addresses.create`, never the
//! fn-name default utoipa would otherwise pick, because the SDK route map and
//! hey-api's generated method names both key on the dotted id.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use super::addresses_model::{Address, AddressRow, CreateAddressBody};
use super::addresses_repo;
use crate::api::ApiError;
use crate::app::AppState;

/// `GET /entities/{id}/addresses` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AddressListResponse {
    pub data: Vec<Address>,
}

/// `POST /entities/{id}/addresses` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AddressMutation {
    pub data: Address,
    pub message: String,
}

/// Mount the addresses routes onto a router sharing [`AppState`].
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/entities/{id}/addresses",
        get(list_addresses).post(create_address),
    )
}

#[utoipa::path(
    get,
    path = "/entities/{id}/addresses",
    operation_id = "entities.addresses.list",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "The entity's addresses", body = AddressListResponse),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn list_addresses(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AddressListResponse>, ApiError> {
    if !addresses_repo::get_entity_exists(&state.pool, &id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::not_found("Entity", &id));
    }

    let rows = addresses_repo::list_for_entity(&state.pool, &id)
        .await
        .map_err(db_error)?;

    Ok(Json(AddressListResponse {
        data: rows.into_iter().map(Address::from).collect::<Vec<_>>(),
    }))
}

#[utoipa::path(
    post,
    path = "/entities/{id}/addresses",
    operation_id = "entities.addresses.create",
    params(("id" = String, Path, description = "Entity id")),
    request_body = CreateAddressBody,
    responses(
        (status = 201, description = "Created address", body = AddressMutation),
        (status = 400, description = "Invalid body", body = crate::api::ErrorBody),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn create_address(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateAddressBody>,
) -> Result<(StatusCode, Json<AddressMutation>), ApiError> {
    if body.value.trim().is_empty() {
        return Err(ApiError::bad_request("Value is required"));
    }
    if !addresses_repo::get_entity_exists(&state.pool, &id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::not_found("Entity", &id));
    }

    let row: AddressRow = addresses_repo::create(&state.pool, &id, body)
        .await
        .map_err(db_error)?;

    Ok((
        StatusCode::CREATED,
        Json(AddressMutation {
            data: row.into(),
            message: "Address created".to_string(),
        }),
    ))
}

fn db_error(err: sqlx::Error) -> ApiError {
    ApiError::internal(err.to_string())
}
