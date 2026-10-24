//! Snapshot-proven incoming-row and candidate-evidence pagination for import review.

use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};

use super::review;
use super::review_model::{ImportReview, ReviewQuery};
use crate::api::ApiError;
use crate::app::AppState;

/// Mount the read-only projection; candidate identity is classified exclusively on the server.
pub fn router() -> Router<AppState> {
    Router::new().route("/imports/{id}/review-proposals", get(get_review))
}

/// Read bounded evidence pages from complete-batch classification, rejecting stale page proofs.
#[utoipa::path(get, path="/imports/{id}/review-proposals", operation_id="imports.review.proposals", params(("id"=String,Path,description="Import batch id"),ReviewQuery), responses((status=200,description="Coherent import review page",body=ImportReview),(status=400,description="Invalid review pagination",body=crate::api::ErrorBody),(status=404,description="Unknown import or row",body=crate::api::ErrorBody),(status=409,description="Review snapshot changed",body=crate::api::ErrorBody)))]
pub async fn get_review(
    State(state): State<AppState>,
    Path(id): Path<String>,
    query: Result<Query<ReviewQuery>, QueryRejection>,
) -> Result<Json<ImportReview>, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::bad_request("Invalid import review page"))?;
    review::get(&state.pool, &id, &query)
        .await
        .map(Json)
        .map_err(super::routes::api_error)
}
