//! Single-mutation review decisions; shared application middleware enforces operation scopes.

use axum::extract::rejection::JsonRejection;
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::routing::post;
use axum::{Json, Router};

use super::review_decision_model::{ReviewDecisionInput, ReviewDecisionReceipt};
use super::review_decision_service;
use crate::api::ApiError;
use crate::app::AppState;

/// Mount bounded atomic review mutations independently of upload body limits.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/imports/{id}/review-decisions", post(decide))
        .layer(DefaultBodyLimit::max(128 * 1024))
}

/// Apply only explicitly selected candidates atomically; exact retries return the stored receipt.
#[utoipa::path(post,path="/imports/{id}/review-decisions",operation_id="imports.review.decide",params(("id"=String,Path,description="Import batch id")),request_body=ReviewDecisionInput,responses((status=200,description="Atomic reviewed-row receipt",body=ReviewDecisionReceipt),(status=400,description="Invalid review choices",body=crate::api::ErrorBody),(status=404,description="Unknown import resource",body=crate::api::ErrorBody),(status=409,description="Stale review or conflicting decision",body=crate::api::ErrorBody)))]
pub async fn decide(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<ReviewDecisionInput>, JsonRejection>,
) -> Result<Json<ReviewDecisionReceipt>, ApiError> {
    let Json(input) = body.map_err(|_| ApiError::bad_request("Invalid import review body"))?;
    review_decision_service::decide(&state.pool, &id, &input)
        .await
        .map(Json)
        .map_err(super::routes::api_error)
}
