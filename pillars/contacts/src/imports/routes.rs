//! Bounded file staging, preview reads and atomic selected-row commit routes.

use axum::body::Bytes;
use axum::extract::rejection::{BytesRejection, JsonRejection, QueryRejection};
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};

use super::file::parse_stage_input;
use super::model::{CommitBatchInput, CommitReceipt, ImportBatch};
use super::parser::{FileEncoding, FileFormat, MAX_FILE_BYTES};
use super::service::{self, ImportError};
use crate::api::ApiError;
use crate::app::AppState;

/// Raw export bytes; generated browser clients send a Blob or File without JSON encoding.
#[derive(ToSchema)]
#[schema(value_type = String, format = Binary)]
pub struct FileBytes(pub Vec<u8>);

/// Supported export formats; the caller chooses explicitly rather than guessing from content.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum UploadFormat {
    GoogleCsv,
    Vcard,
}

/// Explicit text decoding for file uploads.
#[derive(Debug, Default, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum UploadEncoding {
    #[default]
    Utf8,
    Utf16Le,
    Utf16Be,
    Windows1252,
}

/// Account, collection and decoding metadata for a raw file upload.
#[derive(Debug, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[into_params(parameter_in = Query, rename_all = "camelCase")]
pub struct FileStageQuery {
    pub account_id: String,
    pub collection_key: String,
    pub format: UploadFormat,
    #[serde(default)]
    #[param(required = false)]
    pub encoding: UploadEncoding,
    pub phone_country_code: Option<String>,
}

/// Mount import operations; the shared application middleware enforces their OpenAPI scopes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/imports/files", post(stage_file))
        .route("/imports/{id}", get(get_batch))
        .route("/imports/{id}/commit", post(commit_batch))
        .layer(DefaultBodyLimit::max(MAX_FILE_BYTES))
}

/// Stage a raw export file; malformed records remain inspectable without directory writes.
#[utoipa::path(post, path="/imports/files", operation_id="imports.files.stage", params(FileStageQuery), request_body(content=inline(FileBytes),content_type="application/octet-stream"), responses((status=201,description="Persisted preview",body=ImportBatch),(status=400,description="Invalid upload",body=crate::api::ErrorBody),(status=404,description="Unknown source account",body=crate::api::ErrorBody)))]
pub async fn stage_file(
    State(state): State<AppState>,
    query: Result<Query<FileStageQuery>, QueryRejection>,
    bytes: Result<Bytes, BytesRejection>,
) -> Result<(StatusCode, Json<ImportBatch>), ApiError> {
    let Query(query) =
        query.map_err(|_| ApiError::bad_request("Invalid import upload metadata"))?;
    if query.phone_country_code.as_ref().is_some_and(|country| {
        crate::identity::normalize::phone_country(country).is_none()
    }) {
        return Err(ApiError::bad_request(
            "Phone country context requires a known ISO country code",
        ));
    }
    let bytes = bytes.map_err(|_| {
        ApiError::bad_request("Import upload exceeds the byte limit or could not be read")
    })?;
    let format = match query.format {
        UploadFormat::GoogleCsv => FileFormat::GoogleCsv,
        UploadFormat::Vcard => FileFormat::Vcard,
    };
    let encoding = match query.encoding {
        UploadEncoding::Utf8 => FileEncoding::Utf8,
        UploadEncoding::Utf16Le => FileEncoding::Utf16Le,
        UploadEncoding::Utf16Be => FileEncoding::Utf16Be,
        UploadEncoding::Windows1252 => FileEncoding::Windows1252,
    };
    let mut input = parse_stage_input(
        query.account_id,
        query.collection_key,
        &bytes,
        format,
        encoding,
    )
    .map_err(api_error)?;
    if let Some(country) = query.phone_country_code {
        for row in &mut input.rows {
            if let Some(payload) = &mut row.payload {
                for point in &mut payload.points {
                    if point.kind == crate::persons::model::ContactPointKind::Phone {
                        point.country_code = Some(country.clone());
                    }
                }
            }
        }
    }
    let batch = service::stage(&state.pool, &input)
        .await
        .map_err(api_error)?;
    Ok((StatusCode::CREATED, Json(batch)))
}

/// Read a durable preview after a partial commit or a process restart.
#[utoipa::path(get,path="/imports/{id}",operation_id="imports.get",params(("id"=String,Path,description="Import batch id")),responses((status=200,description="Import preview",body=ImportBatch),(status=404,description="Unknown import",body=crate::api::ErrorBody)))]
pub async fn get_batch(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ImportBatch>, ApiError> {
    service::get(&state.pool, &id)
        .await
        .map(Json)
        .map_err(api_error)
}

/// Apply selected decisions atomically, preserving a receipt for identical retries.
#[utoipa::path(post,path="/imports/{id}/commit",operation_id="imports.commit",params(("id"=String,Path,description="Import batch id")),request_body=CommitBatchInput,responses((status=200,description="Stable commit receipt",body=CommitReceipt),(status=400,description="Invalid row decisions",body=crate::api::ErrorBody),(status=404,description="Unknown import or person",body=crate::api::ErrorBody),(status=409,description="Stale preview or conflicting retry",body=crate::api::ErrorBody)))]
pub async fn commit_batch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<CommitBatchInput>, JsonRejection>,
) -> Result<Json<CommitReceipt>, ApiError> {
    let Json(input) = body.map_err(|_| ApiError::bad_request("Invalid import commit body"))?;
    service::commit(&state.pool, &id, &input)
        .await
        .map(Json)
        .map_err(api_error)
}

fn api_error(error: ImportError) -> ApiError {
    match error {
        ImportError::Invalid(message) => ApiError::bad_request(message),
        ImportError::Conflict(message) => ApiError::import_conflict(message),
        ImportError::NotFound => ApiError::not_found("Import resource", "unavailable"),
        ImportError::Storage => ApiError::import_storage(),
    }
}
