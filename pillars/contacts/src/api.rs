//! Shared HTTP response building blocks for the contacts API surface.

use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;

const REQUEST_ID_HEADER: &str = "x-request-id";

tokio::task_local! {
    static CURRENT_REQUEST_ID: String;
}

/// Stable error codes returned by the contacts pillar.
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub enum ErrorCode {
    #[serde(rename = "contacts.request.invalid")]
    InvalidRequest,
    #[serde(rename = "contacts.resource.not_found")]
    NotFound,
    #[serde(rename = "contacts.entity.name_conflict")]
    NameConflict,
    /// Missing, unknown, or revoked service-account credentials.
    #[serde(rename = "contacts.auth.unauthorized")]
    ServiceAccountUnauthorized,
    /// A live service account does not have the required operation scope.
    #[serde(rename = "contacts.auth.forbidden")]
    ServiceAccountForbidden,
    /// The registry could not verify presented service-account credentials.
    #[serde(rename = "contacts.auth.unavailable")]
    ServiceAccountUnavailable,
    #[serde(rename = "contacts.internal")]
    Internal,
}

/// Error envelope returned by every fallible contacts route.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
    pub request_id: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

/// A typed contacts API error with its HTTP status and safe wire fields.
#[derive(Debug, Clone)]
pub struct ApiError {
    status: StatusCode,
    message: String,
    code: ErrorCode,
    retryable: bool,
    details: Option<Value>,
}

impl ApiError {
    /// Build a resource-not-found response.
    pub fn not_found(resource: &str, id: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: format!("{resource} '{id}' not found"),
            code: ErrorCode::NotFound,
            retryable: false,
            details: None,
        }
    }

    /// Build an entity-name conflict response.
    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
            code: ErrorCode::NameConflict,
            retryable: false,
            details: None,
        }
    }

    /// Build an invalid-request response.
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
            code: ErrorCode::InvalidRequest,
            retryable: false,
            details: None,
        }
    }

    /// Build a 401 response for a missing, unknown, or revoked service account.
    pub fn service_account_unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: "Missing or invalid service-account credentials.".to_string(),
            code: ErrorCode::ServiceAccountUnauthorized,
            retryable: false,
            details: None,
        }
    }

    /// Build a 403 response for a service account without the required scope.
    pub fn service_account_forbidden() -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            message: "This service account is not authorised for this operation.".to_string(),
            code: ErrorCode::ServiceAccountForbidden,
            retryable: false,
            details: None,
        }
    }

    /// Build a retryable 503 response when the registry cannot verify a key.
    pub fn service_account_unavailable() -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "Service-account credentials could not be verified.".to_string(),
            code: ErrorCode::ServiceAccountUnavailable,
            retryable: true,
            details: None,
        }
    }

    /// Log a database failure with its request id and return a generic error.
    pub fn database(error: sqlx::Error) -> Self {
        let request_id = current_request_id();
        tracing::error!(%request_id, %error, "contacts database request failed");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "An unexpected error occurred".to_string(),
            code: ErrorCode::Internal,
            retryable: false,
            details: None,
        }
    }

    /// Attach structured, client-safe context to an error response.
    pub fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            code: self.code,
            message: self.message,
            request_id: current_request_id(),
            retryable: self.retryable,
            details: self.details,
        };
        (self.status, Json(body)).into_response()
    }
}

/// Request-id middleware that echoes a valid incoming id or mints a UUID.
pub async fn request_id_layer(mut request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    request
        .extensions_mut()
        .insert(RequestId(request_id.clone()));
    let response_request_id = request_id.clone();
    let mut response = CURRENT_REQUEST_ID
        .scope(request_id, next.run(request))
        .await;
    let header_value = HeaderValue::from_str(&response_request_id)
        .expect("request ids originate from a valid request header or UUID");
    response
        .headers_mut()
        .insert(REQUEST_ID_HEADER, header_value);
    response
}

/// Request id attached to request extensions by [`request_id_layer`].
#[derive(Debug, Clone)]
pub struct RequestId(pub String);

fn current_request_id() -> String {
    CURRENT_REQUEST_ID
        .try_with(Clone::clone)
        .unwrap_or_else(|_| Uuid::new_v4().to_string())
}

/// Pagination envelope returned by every list endpoint.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaginationMeta {
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
}

impl PaginationMeta {
    /// Build pagination metadata for a result set.
    pub fn new(total: i64, limit: i64, offset: i64) -> Self {
        Self {
            total,
            limit,
            offset,
            has_more: offset + limit < total,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_reports_more_when_rows_remain() {
        let meta = PaginationMeta::new(10, 2, 4);
        assert!(meta.has_more);
        let meta = PaginationMeta::new(10, 2, 8);
        assert!(!meta.has_more);
        let meta = PaginationMeta::new(10, 50, 0);
        assert!(!meta.has_more);
    }

    #[test]
    fn error_body_omits_absent_details() {
        let json = serde_json::to_value(ErrorBody {
            code: ErrorCode::InvalidRequest,
            message: "x".to_string(),
            request_id: "request-1".to_string(),
            retryable: false,
            details: None,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "code": "contacts.request.invalid",
                "message": "x",
                "requestId": "request-1",
                "retryable": false
            })
        );
    }
}
