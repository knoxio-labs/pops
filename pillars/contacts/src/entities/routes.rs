//! Axum routes for the entities (contact) CRUD surface + bulk lookup.
//!
//! Every `#[utoipa::path]` pins `operation_id` to the DOTTED `<router>.<proc>`
//! string (`entities.list`, `entities.create`, …). This is load-bearing: the
//! SDK route map keys on the dotted operationId and hey-api derives the
//! camelCase client method names from it, so a derived (Rust fn name) id would
//! silently break every consumer. utoipa's default id is the fn name and
//! cannot contain a dot, hence the explicit override on each route.

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::header::CONTENT_TYPE;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use super::colours::random_other_colour;
use super::model::{
    AssetIdPatch, CreateEntityBody, Entity, EntityLookup, EntityRow, UpdateEntityBody, ENTITY_TYPES,
};
use super::repo;
use crate::api::{ApiError, PaginationMeta};
use crate::app::AppState;
use crate::blobs;
use crate::time::now_rfc3339;

/// Content types an avatar/poster upload is accepted in. SVG is deliberately
/// excluded (unlike the ticket's illustrative list): an SVG can carry
/// `<script>`/`onload=`/`foreignObject` payloads that execute in the
/// viewer's origin, and this monorepo has no SVG sanitiser dependency.
/// The image formats an asset may be. Decided by the bytes, not by a header.
const ASSET_ALLOWED_CONTENT_TYPES: [&str; 3] = ["image/png", "image/jpeg", "image/webp"];

// A marker type rather than a bare `Vec<u8>`, which utoipa maps to
// `{ type: "array", items: { type: "integer" } }` — hey-api projects that to
// `Array<number>` on every generated consumer, while the generated upload
// wrapper hands `body` to `fetch` unserialized. A plain number array is not
// valid `BodyInit`, so `Request` coerces it via `String(array)` and a caller
// following the declared type sends the bytes of `"137,80,78,71,…"` rather
// than the image (POPS-3091). `string`/`binary` is what makes the generated
// body and response a `Blob | File`.
/// Raw image bytes on the wire — an opaque binary stream, not a JSON array.
#[derive(ToSchema)]
#[schema(value_type = String, format = Binary)]
pub struct ImageBytes(pub Vec<u8>);

/// Size cap on an avatar/poster upload — a small square mark or a modest
/// banner image, not a full-resolution photo.
const ASSET_MAX_BYTES: usize = 2 * 1024 * 1024;

/// Which entity asset an upload/serve request targets.
#[derive(Debug, Clone, Copy)]
enum AssetField {
    Avatar,
    Poster,
}

impl AssetField {
    fn get(self, row: &EntityRow) -> Option<&str> {
        match self {
            AssetField::Avatar => row.avatar_asset_id.as_deref(),
            AssetField::Poster => row.poster_asset_id.as_deref(),
        }
    }

    /// Build the patch that repoints this field at a freshly created blob.
    fn set_patch(self, asset_id: String) -> AssetIdPatch {
        self.patch(Some(asset_id))
    }

    /// Build the patch that clears this field.
    fn clear_patch(self) -> AssetIdPatch {
        self.patch(None)
    }

    fn patch(self, asset_id: Option<String>) -> AssetIdPatch {
        match self {
            AssetField::Avatar => AssetIdPatch {
                avatar_asset_id: Some(asset_id),
                ..Default::default()
            },
            AssetField::Poster => AssetIdPatch {
                poster_asset_id: Some(asset_id),
                ..Default::default()
            },
        }
    }

    fn label(self) -> &'static str {
        match self {
            AssetField::Avatar => "avatar",
            AssetField::Poster => "poster",
        }
    }
}

/// Default page size when `limit` is omitted, matching the core entities list.
const DEFAULT_LIMIT: i64 = 50;
/// Hard cap on `limit` so a caller cannot request an unbounded page.
const MAX_LIMIT: i64 = 200;

/// Query params for `GET /entities`.
#[derive(Debug, Clone, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub search: Option<String>,
    #[param(rename = "type")]
    pub r#type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// `GET /entities` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityListResponse {
    pub data: Vec<Entity>,
    pub pagination: PaginationMeta,
}

/// `GET /entities/:id` response body.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityResponse {
    pub data: Entity,
}

/// Create/update response body — the entity plus a human-readable message.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EntityMutation {
    pub data: Entity,
    pub message: String,
}

/// Bare `{ message }` body returned by delete.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

/// `POST /entities/lookup` body — reserved for a future field selector; an
/// empty body fetches the default match columns.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct LookupBody {
    #[serde(default)]
    pub fields: Option<Vec<String>>,
}

/// `POST /entities/lookup` response — the whole contact set's match columns in
/// one round-trip, plus the fetch instant for the caller's in-run cache.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LookupResponse {
    pub entities: Vec<EntityLookup>,
    pub fetched_at: String,
}

/// Mount the entities routes onto a router sharing [`AppState`].
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities", get(list).post(create))
        .route(
            "/entities/{id}",
            get(get_one).patch(update).delete(delete_one),
        )
        .route("/entities/lookup", post(lookup))
        .route("/entities/{id}/colour/reroll", post(reroll_colour))
        .route(
            "/entities/{id}/avatar",
            get(get_avatar).put(upload_avatar).delete(remove_avatar),
        )
        .route(
            "/entities/{id}/poster",
            get(get_poster).put(upload_poster).delete(remove_poster),
        )
        // The default axum body limit (2 MiB) sits exactly at
        // `ASSET_MAX_BYTES`, which would reject an over-cap upload before it
        // reaches `assert_within_size_cap` and hand back axum's generic 413
        // instead of this module's `ErrorBody`. Raising it here lets any
        // upload up to double the cap reach the handler for a precise,
        // consistent error; a request larger than that still gets axum's
        // built-in (non-panicking) rejection.
        .layer(DefaultBodyLimit::max(ASSET_MAX_BYTES * 2))
}

#[utoipa::path(
    get,
    path = "/entities",
    operation_id = "entities.list",
    params(ListQuery),
    responses((status = 200, description = "Paginated entity list", body = EntityListResponse))
)]
pub async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<EntityListResponse>, ApiError> {
    if let Some(ty) = query.r#type.as_deref() {
        validate_type(ty)?;
    }
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = query.offset.unwrap_or(0).max(0);

    let (rows, total) = repo::list(
        &state.pool,
        query.search.as_deref(),
        query.r#type.as_deref(),
        limit,
        offset,
    )
    .await
    .map_err(db_error)?;

    Ok(Json(EntityListResponse {
        data: rows.into_iter().map(Entity::from).collect(),
        pagination: PaginationMeta::new(total, limit, offset),
    }))
}

#[utoipa::path(
    get,
    path = "/entities/{id}",
    operation_id = "entities.get",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "The entity", body = EntityResponse),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<EntityResponse>, ApiError> {
    let row = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;
    Ok(Json(EntityResponse { data: row.into() }))
}

#[utoipa::path(
    post,
    path = "/entities",
    operation_id = "entities.create",
    request_body = CreateEntityBody,
    responses(
        (status = 201, description = "Created entity", body = EntityMutation),
        (status = 400, description = "Invalid body", body = crate::api::ErrorBody),
        (status = 409, description = "Duplicate name", body = crate::api::ErrorBody)
    )
)]
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateEntityBody>,
) -> Result<(StatusCode, Json<EntityMutation>), ApiError> {
    if body.name.trim().is_empty() {
        return Err(ApiError::bad_request("Name is required"));
    }
    if let Some(ty) = body.r#type.as_deref() {
        validate_type(ty)?;
    }

    let row = repo::create(&state.pool, body).await.map_err(repo_error)?;
    Ok((
        StatusCode::CREATED,
        Json(EntityMutation {
            data: row.into(),
            message: "Entity created".to_string(),
        }),
    ))
}

#[utoipa::path(
    patch,
    path = "/entities/{id}",
    operation_id = "entities.update",
    params(("id" = String, Path, description = "Entity id")),
    request_body = UpdateEntityBody,
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody),
        (status = 409, description = "Duplicate name", body = crate::api::ErrorBody)
    )
)]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<UpdateEntityBody>,
) -> Result<Json<EntityMutation>, ApiError> {
    if let Some(name) = patch.name.as_deref() {
        if name.trim().is_empty() {
            return Err(ApiError::bad_request("Name cannot be empty"));
        }
    }
    if let Some(ty) = patch.r#type.as_deref() {
        validate_type(ty)?;
    }

    let row = repo::update(&state.pool, &id, patch)
        .await
        .map_err(|err| repo_not_found(err, &id))?;

    Ok(Json(EntityMutation {
        data: row.into(),
        message: "Entity updated".to_string(),
    }))
}

/// `POST /entities/{id}/colour/reroll` — the only way a client can change an
/// entity's `colour` after creation: a fresh pick from the fixed palette,
/// guaranteed different from the entity's current value (POPS-3061 design
/// correction — `colour` is otherwise immutable through the generic PATCH).
#[utoipa::path(
    post,
    path = "/entities/{id}/colour/reroll",
    operation_id = "entities.reroll_colour",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Entity with a freshly rerolled colour", body = EntityMutation),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn reroll_colour(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<EntityMutation>, ApiError> {
    let before = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;

    let current = before.colour.as_deref().unwrap_or_default();
    let next = random_other_colour(current);

    let row = repo::set_colour(&state.pool, &id, next)
        .await
        .map_err(|err| repo_not_found(err, &id))?;

    Ok(Json(EntityMutation {
        data: row.into(),
        message: "Entity colour rerolled".to_string(),
    }))
}

/// `PUT /entities/{id}/avatar` — upload/replace the entity's avatar.
#[utoipa::path(
    put,
    path = "/entities/{id}/avatar",
    operation_id = "entities.upload_avatar",
    params(("id" = String, Path, description = "Entity id")),
    request_body(content = inline(ImageBytes), description = "Raw image bytes; the format is read from them, not from the Content-Type header", content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 400, description = "Not a supported image, or oversized", body = crate::api::ErrorBody),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn upload_avatar(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<EntityMutation>, ApiError> {
    upload_asset(state, id, AssetField::Avatar, body).await
}

/// `PUT /entities/{id}/poster` — upload/replace the entity's poster image.
#[utoipa::path(
    put,
    path = "/entities/{id}/poster",
    operation_id = "entities.upload_poster",
    params(("id" = String, Path, description = "Entity id")),
    request_body(content = inline(ImageBytes), description = "Raw image bytes; the format is read from them, not from the Content-Type header", content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 400, description = "Not a supported image, or oversized", body = crate::api::ErrorBody),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn upload_poster(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<EntityMutation>, ApiError> {
    upload_asset(state, id, AssetField::Poster, body).await
}

/// Shared upload path for both asset fields: validate, insert the new blob,
/// repoint the entity's asset id, then delete the old blob (if any) — so a
/// crash mid-operation never leaves the entity referencing nothing.
async fn upload_asset(
    state: AppState,
    id: String,
    field: AssetField,
    body: Bytes,
) -> Result<Json<EntityMutation>, ApiError> {
    assert_within_size_cap(body.len())?;
    // The size cap first: it is the cheaper refusal, and it is what makes the
    // sniff below safe to index into.
    let content_type = resolve_content_type(&body)?;

    let before = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;

    let blob_id = blobs::repo::create(&state.pool, content_type, &body)
        .await
        .map_err(db_error)?;

    let row = repo::set_asset_ids(&state.pool, &id, field.set_patch(blob_id))
        .await
        .map_err(|err| repo_not_found(err, &id))?;

    if let Some(old) = field.get(&before) {
        blobs::repo::delete(&state.pool, old)
            .await
            .map_err(db_error)?;
    }

    Ok(Json(EntityMutation {
        data: row.into(),
        message: format!("Entity {} updated", field.label()),
    }))
}

/// `DELETE /entities/{id}/avatar` — clear the entity's avatar and delete the
/// backing blob.
#[utoipa::path(
    delete,
    path = "/entities/{id}/avatar",
    operation_id = "entities.remove_avatar",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn remove_avatar(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<EntityMutation>, ApiError> {
    remove_asset(state, id, AssetField::Avatar).await
}

/// `DELETE /entities/{id}/poster` — clear the entity's poster and delete the
/// backing blob.
#[utoipa::path(
    delete,
    path = "/entities/{id}/poster",
    operation_id = "entities.remove_poster",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Updated entity", body = EntityMutation),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn remove_poster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<EntityMutation>, ApiError> {
    remove_asset(state, id, AssetField::Poster).await
}

/// Shared remove path for both asset fields: clear the column, then delete
/// the blob it used to point at (if any). Idempotent — removing an
/// already-unset field just returns the entity unchanged.
async fn remove_asset(
    state: AppState,
    id: String,
    field: AssetField,
) -> Result<Json<EntityMutation>, ApiError> {
    let before = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;

    let row = repo::set_asset_ids(&state.pool, &id, field.clear_patch())
        .await
        .map_err(|err| repo_not_found(err, &id))?;

    if let Some(old) = field.get(&before) {
        blobs::repo::delete(&state.pool, old)
            .await
            .map_err(db_error)?;
    }

    Ok(Json(EntityMutation {
        data: row.into(),
        message: format!("Entity {} removed", field.label()),
    }))
}

/// `GET /entities/{id}/avatar` — serve the entity's avatar bytes.
#[utoipa::path(
    get,
    path = "/entities/{id}/avatar",
    operation_id = "entities.get_avatar",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Raw image bytes", content_type = "application/octet-stream", body = inline(ImageBytes)),
        (status = 404, description = "No such entity, or no avatar set", body = crate::api::ErrorBody)
    )
)]
pub async fn get_avatar(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    serve_asset(state, id, AssetField::Avatar).await
}

/// `GET /entities/{id}/poster` — serve the entity's poster bytes.
#[utoipa::path(
    get,
    path = "/entities/{id}/poster",
    operation_id = "entities.get_poster",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Raw image bytes", content_type = "application/octet-stream", body = inline(ImageBytes)),
        (status = 404, description = "No such entity, or no poster set", body = crate::api::ErrorBody)
    )
)]
pub async fn get_poster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    serve_asset(state, id, AssetField::Poster).await
}

async fn serve_asset(state: AppState, id: String, field: AssetField) -> Result<Response, ApiError> {
    let row = repo::get(&state.pool, &id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found("Entity", &id))?;
    let asset_id = field
        .get(&row)
        .ok_or_else(|| ApiError::not_found(field.label(), &id))?;
    let blob = blobs::repo::get(&state.pool, asset_id)
        .await
        .map_err(db_error)?
        .ok_or_else(|| ApiError::not_found(field.label(), asset_id))?;
    Ok(([(CONTENT_TYPE, blob.content_type)], blob.data).into_response())
}

/// The image format these bytes actually are, by signature.
///
/// A file's first bytes are the one description of it that the sender cannot
/// get wrong. The `Content-Type` header was what decided this before, and it
/// was wrong in both directions: the OpenAPI document declared
/// `application/octet-stream` for the request, which the header check rejected
/// outright — so the obvious, fully type-checked
/// `entitiesUploadAvatar({ path, body: file })` always 400'd, and only a
/// caller who knew to override the generated default got through (POPS-3244).
/// And the header was stored as the blob's own content type, so a client that
/// mislabelled a file had that label served back to every reader of it.
///
/// Signatures rather than a crate: three formats, each discriminated by its
/// first bytes, is not a dependency's worth of problem.
fn sniff_content_type(bytes: &[u8]) -> Option<&'static str> {
    const PNG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.starts_with(&PNG) {
        return Some("image/png");
    }
    // Every JPEG starts SOI + the first marker. The fourth byte varies by
    // encoder (JFIF, Exif, raw), so three is the whole discriminating prefix.
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    // RIFF container, with the form type four bytes after the length.
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

/// The content type to store, or a 400 naming what would have been accepted.
fn resolve_content_type(bytes: &[u8]) -> Result<&'static str, ApiError> {
    sniff_content_type(bytes).ok_or_else(|| {
        ApiError::bad_request(format!(
            "Upload is not a supported image. Allowed: {}",
            ASSET_ALLOWED_CONTENT_TYPES.join(", ")
        ))
    })
}

fn assert_within_size_cap(byte_length: usize) -> Result<(), ApiError> {
    if byte_length == 0 {
        Err(ApiError::bad_request("Upload is empty"))
    } else if byte_length > ASSET_MAX_BYTES {
        Err(ApiError::bad_request(format!(
            "Upload exceeds the maximum allowed size of {ASSET_MAX_BYTES} bytes"
        )))
    } else {
        Ok(())
    }
}

#[utoipa::path(
    delete,
    path = "/entities/{id}",
    operation_id = "entities.delete",
    params(("id" = String, Path, description = "Entity id")),
    responses(
        (status = 200, description = "Deleted", body = MessageResponse),
        (status = 404, description = "No such entity", body = crate::api::ErrorBody)
    )
)]
pub async fn delete_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<MessageResponse>, ApiError> {
    let removed = repo::delete(&state.pool, &id).await.map_err(db_error)?;
    if !removed {
        return Err(ApiError::not_found("Entity", &id));
    }
    Ok(Json(MessageResponse {
        message: "Entity deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/entities/lookup",
    operation_id = "entities.lookup",
    request_body = LookupBody,
    responses((status = 200, description = "Bulk match columns", body = LookupResponse))
)]
pub async fn lookup(
    State(state): State<AppState>,
    body: Option<Json<LookupBody>>,
) -> Result<Json<LookupResponse>, ApiError> {
    let _ = body;
    let rows = repo::lookup_bulk(&state.pool).await.map_err(db_error)?;
    Ok(Json(LookupResponse {
        entities: rows.into_iter().map(EntityLookup::from).collect(),
        fetched_at: now_rfc3339(),
    }))
}

/// Reject a `type` value outside the accepted entity discriminator set with a
/// 400, listing the legal values.
fn validate_type(ty: &str) -> Result<(), ApiError> {
    if ENTITY_TYPES.contains(&ty) {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!(
            "Invalid type '{ty}'. Expected one of: {}",
            ENTITY_TYPES.join(", ")
        )))
    }
}

fn db_error(err: sqlx::Error) -> ApiError {
    ApiError::internal(err.to_string())
}

fn repo_error(err: repo::RepoError) -> ApiError {
    match err {
        repo::RepoError::Conflict(message) => ApiError::conflict(message),
        repo::RepoError::NotFound => ApiError::not_found("Entity", "unknown"),
        repo::RepoError::Db(e) => db_error(e),
    }
}

fn repo_not_found(err: repo::RepoError, id: &str) -> ApiError {
    match err {
        repo::RepoError::NotFound => ApiError::not_found("Entity", id),
        other => repo_error(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_type() {
        assert!(validate_type("wizard").is_err());
        assert!(validate_type("person").is_ok());
    }

    /// A real signature per format, and the shapes that must not pass.
    #[test]
    fn sniffs_each_allowed_format_and_nothing_else() {
        assert_eq!(
            sniff_content_type(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2]),
            Some("image/png")
        );
        assert_eq!(
            sniff_content_type(&[0xFF, 0xD8, 0xFF, 0xE0, 9]),
            Some("image/jpeg")
        );
        assert_eq!(
            sniff_content_type(b"RIFF\x24\x00\x00\x00WEBPVP8 "),
            Some("image/webp")
        );

        // An SVG names itself an image and is a script delivery vehicle. The
        // header check let it through whenever the client said `image/png`;
        // the bytes never will.
        assert_eq!(sniff_content_type(b"<svg onload=alert(1)></svg>"), None);
        // A truncated signature is not a signature.
        assert_eq!(sniff_content_type(&[0x89, b'P', b'N', b'G']), None);
        assert_eq!(sniff_content_type(b"RIFF\x24\x00\x00\x00WAVE"), None);
        assert_eq!(sniff_content_type(&[]), None);
    }

    #[test]
    fn rejects_disallowed_and_oversized_uploads() {
        assert!(resolve_content_type(&[0xFF, 0xD8, 0xFF]).is_ok());
        assert!(resolve_content_type(b"<svg/>").is_err());
        assert!(resolve_content_type(&[]).is_err());

        assert!(assert_within_size_cap(1).is_ok());
        assert!(assert_within_size_cap(0).is_err());
        assert!(assert_within_size_cap(ASSET_MAX_BYTES).is_ok());
        assert!(assert_within_size_cap(ASSET_MAX_BYTES + 1).is_err());
    }
}
