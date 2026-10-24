//! A single bounded server-proven import action, protected by the shared operation scopes.

use axum::extract::{rejection::JsonRejection, DefaultBodyLimit, Path, State};
use axum::routing::post;
use axum::{Json, Router};

use super::ready_model::{ReadyBatchInput, ReadyBatchReceipt};
use crate::{api::ApiError, app::AppState};

/// Mount the global ready action; the request contains no frontend-selected identities.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/imports/{id}/apply-ready", post(apply))
        .layer(DefaultBodyLimit::max(4096))
}

/// Apply only complete-snapshot ready rows; every late failure rolls back the whole action.
#[utoipa::path(post,path="/imports/{id}/apply-ready",operation_id="imports.ready.apply",params(("id"=String,Path)),request_body=ReadyBatchInput,responses((status=200,body=ReadyBatchReceipt),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn apply(
    State(state): State<AppState>,
    Path(id): Path<String>,
    input: Result<Json<ReadyBatchInput>, JsonRejection>,
) -> Result<Json<ReadyBatchReceipt>, ApiError> {
    let Json(input) = input.map_err(|_| ApiError::bad_request("Invalid ready import request"))?;
    super::ready::apply(&state.pool, &id, &input)
        .await
        .map(Json)
        .map_err(super::routes::api_error)
}
