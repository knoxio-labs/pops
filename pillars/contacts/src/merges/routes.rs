//! Scoped HTTP operations for canonical resolution and explicit identity decisions.

use axum::{
    extract::{rejection::JsonRejection, Path, Request, State},
    http::Method,
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use super::{
    model::{
        IdentityGroup, MergeBody, MergeResult, ResolveBody, ResolveResponse, SeparateBody,
        SeparateList, SeparateResult, UndoBody, UndoResult,
    },
    repo::{self, MergeError},
};
use crate::{api::ApiError, app::AppState};

/// Mount canonical resolution and revision-guarded merge, undo and separation operations.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/resolve", post(resolve))
        .route("/merges", post(merge))
        .route("/merges/groups/{id}", get(group))
        .route("/merges/{id}/undo", post(undo))
        .route("/merges/keep-separate", get(separate_list).post(separate))
}

/// Resolve every historical ID and report the snapshot revision for multi-batch consumers.
#[utoipa::path(post,path="/entities/resolve",operation_id="entities.resolve",request_body=ResolveBody,responses((status=200,body=ResolveResponse),(status=400,body=crate::api::ErrorBody)))]
pub async fn resolve(
    State(state): State<AppState>,
    body: Result<Json<ResolveBody>, JsonRejection>,
) -> Result<Json<ResolveResponse>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid identity request body"))?;
    Ok(Json(
        repo::resolve_many(&state.pool, &body.ids)
            .await
            .map_err(error)?,
    ))
}

/// Read the current canonical group and the conservative directory-wide revision.
#[utoipa::path(get,path="/merges/groups/{id}",operation_id="merges.group",params(("id"=String,Path)),responses((status=200,body=IdentityGroup),(status=404,body=crate::api::ErrorBody)))]
pub async fn group(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<IdentityGroup>, ApiError> {
    Ok(Json(repo::group(&state.pool, &id).await.map_err(error)?))
}

/// Merge only selected groups with explicit field references and immutable retry receipts.
#[utoipa::path(post,path="/merges",operation_id="merges.merge",request_body=MergeBody,responses((status=200,body=MergeResult),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn merge(
    State(state): State<AppState>,
    body: Result<Json<MergeBody>, JsonRejection>,
) -> Result<Json<MergeResult>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid identity request body"))?;
    Ok(Json(
        super::service::merge(&state.pool, body)
            .await
            .map_err(error)?,
    ))
}

/// Undo only an untouched merge. External references created after the merge remain unchanged.
#[utoipa::path(post,path="/merges/{id}/undo",operation_id="merges.undo",params(("id"=String,Path)),request_body=UndoBody,responses((status=200,body=UndoResult),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn undo(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<UndoBody>, JsonRejection>,
) -> Result<Json<UndoResult>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid identity request body"))?;
    Ok(Json(
        super::service::undo(&state.pool, &id, body)
            .await
            .map_err(error)?,
    ))
}

/// List stable member-pair decisions for conservative matching.
#[utoipa::path(get,path="/merges/keep-separate",operation_id="merges.separations",responses((status=200,body=SeparateList)))]
pub async fn separate_list(State(state): State<AppState>) -> Result<Json<SeparateList>, ApiError> {
    Ok(Json(
        repo::separate_pairs(&state.pool).await.map_err(error)?,
    ))
}

/// Persist or revoke candidate-specific separation across the two selected groups.
#[utoipa::path(post,path="/merges/keep-separate",operation_id="merges.separate",request_body=SeparateBody,responses((status=200,body=SeparateResult),(status=400,body=crate::api::ErrorBody),(status=404,body=crate::api::ErrorBody),(status=409,body=crate::api::ErrorBody)))]
pub async fn separate(
    State(state): State<AppState>,
    body: Result<Json<SeparateBody>, JsonRejection>,
) -> Result<Json<SeparateResult>, ApiError> {
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid identity request body"))?;
    Ok(Json(
        super::decisions::decide(&state.pool, body)
            .await
            .map_err(error)?,
    ))
}

pub(crate) fn error(value: MergeError) -> ApiError {
    match value {
        MergeError::Invalid(message) => ApiError::bad_request(message),
        MergeError::NotFound(id) => ApiError::not_found("Identity or merge", &id),
        MergeError::Conflict {
            message,
            canonical_id,
            revision,
        } => ApiError::identity_conflict(message)
            .with_details(json!({"canonicalId":canonical_id,"revision":revision})),
        MergeError::Db(error) => ApiError::database(error),
    }
}

/// Refuse ordinary writes through retired IDs and deletion of any active merged member.
/// Source refreshes use their retained repository ownership directly and remain revision-fenced.
pub async fn guard_writes(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    ) {
        return next.run(request).await;
    }
    let parts: Vec<&str> = request.uri().path().split('/').collect();
    if parts.get(1) != Some(&"entities") {
        return next.run(request).await;
    }
    let Some(id) = parts.get(2) else {
        return next.run(request).await;
    };
    let mut conn = match state.pool.acquire().await {
        Ok(conn) => conn,
        Err(value) => return ApiError::database(value).into_response(),
    };
    let canonical = match repo::resolve_one(&mut conn, id).await {
        Ok(Some(canonical)) => canonical,
        Ok(None) => {
            drop(conn);
            return next.run(request).await;
        }
        Err(value) => return ApiError::database(value).into_response(),
    };
    if canonical != *id {
        return ApiError::identity_conflict("Entity ID is retired; use its canonical identity")
            .with_details(json!({"canonicalId":canonical}))
            .into_response();
    }
    if request.method() == Method::DELETE && parts.len() == 3 {
        let merged: Result<bool, _> = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM entity_redirects WHERE canonical_id=?1) OR EXISTS(SELECT 1 FROM keep_separate WHERE left_id=?1 OR right_id=?1)",
        )
        .bind(*id)
        .fetch_one(&mut *conn)
        .await;
        match merged {
            Ok(true) => {
                return ApiError::identity_conflict(
                    "Resolve identity decisions before deleting this person",
                )
                .into_response()
            }
            Err(value) => return ApiError::database(value).into_response(),
            Ok(false) => {}
        }
    }
    drop(conn);
    next.run(request).await
}
