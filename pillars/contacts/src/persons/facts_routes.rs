//! HTTP contract for complete person drafts and ownership-checked local undo.

use axum::{
    extract::{rejection::JsonRejection, Path, State},
    routing::{get, post},
    Json, Router,
};

use super::{
    facts_model::{FactChangeBody, FactReceipt, FactUndoBody, FactsResponse},
    facts_service,
};
use crate::{api::ApiError, app::AppState};

/// Mount coherent snapshots, atomic draft changes and local undo under a canonical person.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/{id}/facts", get(get_facts))
        .route("/entities/{id}/facts/changes", post(change_facts))
        .route(
            "/entities/{id}/facts/changes/{operation_id}/undo",
            post(undo_facts),
        )
}

/// Read all editable person facts and the exact optimistic version from one snapshot.
#[utoipa::path(get,path="/entities/{id}/facts",operation_id="entities.facts.get",params(("id"=String,Path)),responses((status=200,body=FactsResponse),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody)))]
pub async fn get_facts(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<FactsResponse>, ApiError> {
    Ok(Json(FactsResponse {
        data: facts_service::get(&state.pool, &id)
            .await
            .map_err(crate::merges::routes::error)?,
    }))
}

/// Apply an explicit complete draft atomically without overwriting imported observations.
#[utoipa::path(post,path="/entities/{id}/facts/changes",operation_id="entities.facts.change",params(("id"=String,Path)),request_body=FactChangeBody,responses((status=200,body=FactReceipt),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn change_facts(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<FactChangeBody>, JsonRejection>,
) -> Result<Json<FactReceipt>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid person fact changes"))?;
    Ok(Json(
        facts_service::apply(&state.pool, &id, body)
            .await
            .map_err(crate::merges::routes::error)?,
    ))
}

/// Undo only decisions and preferred selections still owned by the named operation.
#[utoipa::path(post,path="/entities/{id}/facts/changes/{operation_id}/undo",operation_id="entities.facts.undo",params(("id"=String,Path),("operation_id"=String,Path)),request_body=FactUndoBody,responses((status=200,body=FactReceipt),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn undo_facts(
    State(state): State<AppState>,
    Path((id, operation)): Path<(String, String)>,
    body: Result<Json<FactUndoBody>, JsonRejection>,
) -> Result<Json<FactReceipt>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid person fact undo"))?;
    Ok(Json(
        facts_service::undo(&state.pool, &id, &operation, body)
            .await
            .map_err(crate::merges::routes::error)?,
    ))
}
