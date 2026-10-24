//! Explicit human credential administration and scoped provider scan operations.

use super::carddav::credential::CardDavCredential;
use super::credentials::SecretBytes;
use super::human_auth::{HumanAuthError, HumanIdentity};
use super::runtime::{ProviderError, ProviderRuntime};
use crate::api::{ApiError, ErrorCode};
use crate::app::AppState;
use axum::extract::{DefaultBodyLimit, Extension, Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

/// Optional configured provider state. No secrets enter generic app configuration.
pub type ProviderExtension = Option<Arc<ProviderRuntime>>;

/// A credential-free account status for management UI and automation.
#[derive(Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountStatus {
    pub account_id: String,
    pub provider: String,
    pub connected: bool,
    pub reauthorization_required: bool,
    pub include_other_contacts: bool,
}

/// A browser authorization request. Omit accountId only for a new connection.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GoogleAuthorizeRequest {
    /// Separately opt in to Google's additional read-only Other contacts scope.
    #[serde(default)]
    pub include_other_contacts: bool,
    pub account_id: Option<String>,
    pub label: Option<String>,
}

/// One-use OAuth callback. Codes/state are never formatted or serialized.
#[derive(Deserialize, ToSchema, utoipa::IntoParams)]
#[into_params(parameter_in=Query)]
pub struct GoogleCallback {
    #[serde(deserialize_with = "super::google::oauth::deserialize_secret")]
    #[schema(value_type=String)]
    #[param(value_type=String)]
    pub code: SecretBytes,
    #[serde(deserialize_with = "super::google::oauth::deserialize_secret")]
    #[schema(value_type=String)]
    #[param(value_type=String)]
    pub state: SecretBytes,
}

/// App-password connection request. Password has no Debug/Serialize implementation.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IcloudConnectRequest {
    pub account_id: Option<String>,
    pub username: String,
    #[serde(deserialize_with = "super::google::oauth::deserialize_secret")]
    #[schema(value_type=String,write_only=true)]
    pub password: SecretBytes,
    pub label: Option<String>,
}

/// Saved operation identifier; credentials and opaque provider cursors are omitted.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOperation {
    pub account_id: String,
    pub run_id: Option<String>,
}

/// Safe durable scan progress. Returned previews use the shared import endpoints.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRunStatus {
    pub run_id: String,
    pub account_id: String,
    pub status: String,
    pub total_collections: usize,
    pub completed_collections: usize,
    pub batch_ids: Vec<String>,
    pub error_code: Option<String>,
}

/// Mount provider operations; authentication is explicit per handler in addition
/// to the outer OpenAPI-derived service-account scope middleware.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/providers/accounts", get(list_accounts))
        .route("/providers/google/authorize", post(authorize_google))
        .route("/providers/google/callback", get(google_callback))
        .route("/providers/icloud/accounts", post(connect_icloud))
        .route("/providers/accounts/{id}", delete(disconnect))
        .route("/providers/accounts/{id}/sync", post(start_sync))
        .route("/providers/sync/{id}", get(run_status))
        .layer(DefaultBodyLimit::max(8192))
        .layer(axum::middleware::from_fn(no_store))
}

fn configured(extension: ProviderExtension) -> Result<Arc<ProviderRuntime>, ApiError> {
    extension.ok_or_else(|| api(ProviderError::Disabled))
}
async fn human(runtime: &ProviderRuntime, headers: &HeaderMap) -> Result<HumanIdentity, ApiError> {
    runtime
        .human
        .verify(headers)
        .await
        .map_err(|error| match error {
            HumanAuthError::Unauthorized => ApiError::provider(
                StatusCode::UNAUTHORIZED,
                ErrorCode::ServiceAccountUnauthorized,
                "A verified human Access session is required",
                false,
            ),
            HumanAuthError::Forbidden => ApiError::provider(
                StatusCode::FORBIDDEN,
                ErrorCode::ServiceAccountForbidden,
                "An operator Access session is required",
                false,
            ),
            _ => api(ProviderError::Disabled),
        })
}
async fn sync_authorized(runtime: &ProviderRuntime, headers: &HeaderMap) -> Result<(), ApiError> {
    if headers.contains_key("x-api-key") {
        let mut keys = headers.get_all("x-api-key").iter();
        if keys
            .next()
            .and_then(|key| key.to_str().ok())
            .is_none_or(str::is_empty)
            || keys.next().is_some()
        {
            return Err(ApiError::service_account_unauthorized());
        }
        return Ok(());
    }
    human(runtime, headers).await.map(|_| ())
}
fn api(error: ProviderError) -> ApiError {
    let (status, code, message, retryable) = match error {
        ProviderError::Disabled => (
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::ProviderUnavailable,
            "Provider connections are not configured",
            false,
        ),
        ProviderError::IdentityMismatch => (
            StatusCode::CONFLICT,
            ErrorCode::ProviderConflict,
            "Authenticated provider account differs from this connection",
            false,
        ),
        ProviderError::Conflict => (
            StatusCode::CONFLICT,
            ErrorCode::ProviderConflict,
            "Provider connection or scan changed; reload and retry",
            false,
        ),
        ProviderError::Reauthorize => (
            StatusCode::CONFLICT,
            ErrorCode::ProviderReauthorization,
            "Reconnect this provider account before syncing",
            false,
        ),
        ProviderError::Retryable => (
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::ProviderUnavailable,
            "Provider is temporarily unavailable",
            true,
        ),
        ProviderError::NotFound => (
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            "Provider account or scan was not found",
            false,
        ),
        ProviderError::Storage => (
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::ProviderUnavailable,
            "Provider storage is unavailable",
            true,
        ),
        _ => (
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidRequest,
            "Provider request or response failed validation",
            false,
        ),
    };
    ApiError::provider(status, code, message, retryable)
}
async fn no_store(request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    private(next.run(request).await)
}

fn private(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    response
        .headers_mut()
        .insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    response
}

/// List connection states after verifying a human operator; never return secrets.
#[utoipa::path(get,path="/providers/accounts",operation_id="providers.accounts.list",responses((status=200,description="Connection states",body=Vec<ProviderAccountStatus>),(status=401,description="Human session required",body=crate::api::ErrorBody),(status=503,description="Connections unavailable",body=crate::api::ErrorBody)))]
pub async fn list_accounts(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    human(&runtime, &headers).await?;
    let accounts:Vec<ProviderAccountStatus>=sqlx::query_as("SELECT account_id,provider,connected,reauthorization_required,google_other_contacts AS include_other_contacts FROM provider_accounts ORDER BY account_id").fetch_all(&state.pool).await.map_err(|_|api(ProviderError::Storage))?;
    Ok(private(Json(accounts).into_response()))
}

/// Start one-use Google authorization under the verified operator identity.
#[utoipa::path(post,path="/providers/google/authorize",operation_id="providers.google.authorize",request_body=GoogleAuthorizeRequest,responses((status=303,description="Google consent redirect"),(status=401,description="Human session required",body=crate::api::ErrorBody),(status=503,description="Connections unavailable",body=crate::api::ErrorBody)))]
pub async fn authorize_google(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    body: Result<Json<GoogleAuthorizeRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    let human = human(&runtime, &headers).await?;
    let Json(body) = body.map_err(|_| ApiError::bad_request("Invalid authorization request"))?;
    let location = runtime
        .begin_google(
            &state.pool,
            &human,
            body.account_id.as_deref(),
            body.label,
            super::runtime::now(),
            body.include_other_contacts,
        )
        .await
        .map_err(api)?;
    let header =
        HeaderValue::from_str(location.expose()).map_err(|_| api(ProviderError::Invalid))?;
    Ok(private(
        (StatusCode::SEE_OTHER, [("location", header)]).into_response(),
    ))
}

/// Consume state before exchanging the callback code; human subject and account
/// epoch must match the initiating authorization attempt.
#[utoipa::path(get,path="/providers/google/callback",operation_id="providers.google.callback",params(GoogleCallback),responses((status=200,description="Google account connected",body=ProviderOperation),(status=401,description="Human session required",body=crate::api::ErrorBody),(status=409,description="Authorization changed or account mismatch",body=crate::api::ErrorBody)))]
pub async fn google_callback(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    query: Result<Query<GoogleCallback>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    let human = human(&runtime, &headers).await?;
    let Query(body) = query.map_err(|_| ApiError::bad_request("Invalid authorization callback"))?;
    let account_id = runtime
        .finish_google(
            &state.pool,
            &human,
            &body.state,
            &body.code,
            super::runtime::now(),
        )
        .await
        .map_err(api)?;
    Ok(private(
        Json(ProviderOperation {
            account_id,
            run_id: None,
        })
        .into_response(),
    ))
}

/// Validate iCloud credentials and actual principal before encrypted installation.
#[utoipa::path(post,path="/providers/icloud/accounts",operation_id="providers.icloud.connect",request_body=IcloudConnectRequest,responses((status=201,description="iCloud account connected",body=ProviderOperation),(status=401,description="Human session required",body=crate::api::ErrorBody),(status=409,description="Principal mismatch or changed connection",body=crate::api::ErrorBody)))]
pub async fn connect_icloud(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    body: Result<Json<IcloudConnectRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    let human = human(&runtime, &headers).await?;
    let Json(body) =
        body.map_err(|_| ApiError::bad_request("Invalid provider credential request"))?;
    let credential = CardDavCredential::new(body.username, body.password)
        .map_err(|_| api(ProviderError::Invalid))?;
    let account_id = runtime
        .connect_icloud(
            &state.pool,
            &human,
            body.account_id.as_deref(),
            &credential,
            body.label,
        )
        .await
        .map_err(api)?;
    Ok(private(
        (
            StatusCode::CREATED,
            Json(ProviderOperation {
                account_id,
                run_id: None,
            }),
        )
            .into_response(),
    ))
}

/// Revoke credentials and fence callbacks, previews and in-flight provider results.
#[utoipa::path(delete,path="/providers/accounts/{id}",operation_id="providers.accounts.disconnect",params(("id"=String,Path,description="Source account UUID")),responses((status=204,description="Disconnected"),(status=401,description="Human session required",body=crate::api::ErrorBody)))]
pub async fn disconnect(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let runtime = configured(extension)?;
    let human = human(&runtime, &headers).await?;
    super::store::disconnect_account(&state.pool, &human, &id)
        .await
        .map_err(|error| api(error.into()))?;
    Ok(StatusCode::NO_CONTENT)
}

/// Queue a discovered account scan for a verified human or a registry-verified
/// service account admitted by this operation's outer scope gate.
#[utoipa::path(post,path="/providers/accounts/{id}/sync",operation_id="providers.sync.start",params(("id"=String,Path,description="Source account UUID")),responses((status=202,description="Durable scan started",body=ProviderOperation),(status=401,description="Verified identity required",body=crate::api::ErrorBody),(status=409,description="Connection changed or scan already running",body=crate::api::ErrorBody)))]
pub async fn start_sync(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    sync_authorized(&runtime, &headers).await?;
    let run = tokio::time::timeout(
        std::time::Duration::from_secs(240),
        runtime.start_sync(&state.pool, &id),
    )
    .await
    .map_err(|_| api(ProviderError::Retryable))?
    .map_err(api)?;
    Ok(private(
        (
            StatusCode::ACCEPTED,
            Json(ProviderOperation {
                account_id: id,
                run_id: Some(run.id),
            }),
        )
            .into_response(),
    ))
}

/// Read safe scan progress without exposing cursor, raw card or credential values.
#[utoipa::path(get,path="/providers/sync/{id}",operation_id="providers.sync.get",params(("id"=String,Path,description="Durable scan UUID")),responses((status=200,description="Scan progress",body=ProviderRunStatus),(status=401,description="Verified identity required",body=crate::api::ErrorBody)))]
pub async fn run_status(
    State(state): State<AppState>,
    Extension(extension): Extension<ProviderExtension>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let runtime = configured(extension)?;
    sync_authorized(&runtime, &headers).await?;
    let run = super::sync::get_run(&state.pool, &id)
        .await
        .map_err(|error| api(error.into()))?;
    let batch_ids = sqlx::query_scalar(
        "SELECT batch_id FROM provider_batch_guards WHERE run_id=?1 ORDER BY batch_id",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| api(ProviderError::Storage))?;
    let error_code = sqlx::query_scalar("SELECT error_code FROM provider_sync_runs WHERE id=?1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| api(ProviderError::Storage))?;
    Ok(private(
        Json(ProviderRunStatus {
            run_id: id,
            account_id: run.account_id,
            status: run.status,
            total_collections: run.collections.len(),
            completed_collections: run
                .collections
                .iter()
                .filter(|collection| collection.complete)
                .count(),
            batch_ids,
            error_code,
        })
        .into_response(),
    ))
}

#[cfg(test)]
#[path = "routes_tests.rs"]
mod tests;
