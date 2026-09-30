//! Registry-backed service-account scope enforcement for contacts.

use std::collections::hash_map::RandomState;
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasher, Hash, Hasher};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request, State};
use axum::http::header::ALLOW;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

use crate::api::ApiError;

const SERVICE_ACCOUNT_HEADER: &str = "x-api-key";
const SERVICE_ACCOUNT_SELF_PATH: &str = "/service-accounts/self";
const AUTHENTICATED_TTL: Duration = Duration::from_secs(30);
const REJECTED_TTL: Duration = Duration::from_secs(5);
const REGISTRY_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_CACHED_KEYS: usize = 512;
const CONTRACT_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

/// Resolves presented service-account keys through the registry.
///
/// Verified accounts are cached briefly so revocations propagate within the
/// cache window without putting the registry on every request's critical path.
#[derive(Clone)]
pub struct ServiceAccountScopeVerifier {
    registry_url: String,
    client: Client,
    cache: Arc<Mutex<VerificationCache>>,
    key_hasher: RandomState,
}

impl ServiceAccountScopeVerifier {
    /// Create a registry-backed verifier for the given registry origin.
    pub fn new(registry_url: impl Into<String>) -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(REGISTRY_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;

        Ok(Self {
            registry_url: registry_url.into().trim_end_matches('/').to_string(),
            client,
            cache: Arc::new(Mutex::new(VerificationCache::default())),
            key_hasher: RandomState::new(),
        })
    }

    async fn verify(&self, api_key: &str) -> Result<ServiceAccountProfile, VerificationFailure> {
        let digest = self.key_digest(api_key);
        if let Some(cached) = self.cache_read(digest) {
            return cached.into_result();
        }

        let response = self
            .client
            .get(format!(
                "{}{}",
                self.registry_url, SERVICE_ACCOUNT_SELF_PATH
            ))
            .header(SERVICE_ACCOUNT_HEADER, api_key)
            .send()
            .await
            .map_err(|_| VerificationFailure::Unavailable)?;

        let verification = match response.status() {
            StatusCode::UNAUTHORIZED => Err(VerificationFailure::InvalidCredential),
            status if status.is_success() => response
                .json::<ServiceAccountProfile>()
                .await
                .map_err(|_| VerificationFailure::Unavailable)
                .and_then(|profile| {
                    if profile.id.trim().is_empty() || profile.name.trim().is_empty() {
                        Err(VerificationFailure::Unavailable)
                    } else {
                        Ok(profile)
                    }
                }),
            _ => Err(VerificationFailure::Unavailable),
        };

        match &verification {
            Ok(profile) => self.cache_write(
                digest,
                CachedVerification::Authenticated(profile.clone()),
                AUTHENTICATED_TTL,
            ),
            Err(VerificationFailure::InvalidCredential) => {
                self.cache_write(digest, CachedVerification::Rejected, REJECTED_TTL)
            }
            Err(VerificationFailure::Unavailable) => {}
        }

        verification
    }

    fn key_digest(&self, api_key: &str) -> u64 {
        let mut hasher = self.key_hasher.build_hasher();
        api_key.hash(&mut hasher);
        hasher.finish()
    }

    fn cache_read(&self, digest: u64) -> Option<CachedVerification> {
        let mut cache = self
            .cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match cache.entries.get(&digest) {
            Some(entry) if entry.expires_at > Instant::now() => Some(entry.verification.clone()),
            Some(_) => {
                cache.entries.remove(&digest);
                None
            }
            None => None,
        }
    }

    fn cache_write(&self, digest: u64, verification: CachedVerification, ttl: Duration) {
        let mut cache = self
            .cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if !cache.entries.contains_key(&digest) && cache.entries.len() >= MAX_CACHED_KEYS {
            if let Some(oldest) = cache.entries.keys().next().copied() {
                cache.entries.remove(&oldest);
            }
        }
        cache.entries.insert(
            digest,
            CacheEntry {
                expires_at: Instant::now() + ttl,
                verification,
            },
        );
    }
}

#[derive(Clone, Debug, Deserialize)]
struct ServiceAccountProfile {
    id: String,
    name: String,
    scopes: Vec<String>,
}

#[derive(Clone)]
enum CachedVerification {
    Authenticated(ServiceAccountProfile),
    Rejected,
}

impl CachedVerification {
    fn into_result(self) -> Result<ServiceAccountProfile, VerificationFailure> {
        match self {
            Self::Authenticated(profile) => Ok(profile),
            Self::Rejected => Err(VerificationFailure::InvalidCredential),
        }
    }
}

#[derive(Default)]
struct VerificationCache {
    entries: HashMap<u64, CacheEntry>,
}

struct CacheEntry {
    expires_at: Instant,
    verification: CachedVerification,
}

enum VerificationFailure {
    InvalidCredential,
    Unavailable,
}

#[derive(Clone)]
pub(crate) struct ServiceAccountScopeGate {
    verifier: ServiceAccountScopeVerifier,
    scopes: ContractScopeMap,
}

impl ServiceAccountScopeGate {
    pub(crate) fn from_openapi(
        verifier: ServiceAccountScopeVerifier,
        openapi: &str,
    ) -> Result<Self, String> {
        Ok(Self {
            verifier,
            scopes: ContractScopeMap::from_openapi(openapi)?,
        })
    }
}

#[derive(Clone)]
struct ContractScopeMap {
    routes: HashMap<String, String>,
    paths: HashSet<String>,
}

impl ContractScopeMap {
    fn from_openapi(openapi: &str) -> Result<Self, String> {
        let document: Value = serde_json::from_str(openapi)
            .map_err(|error| format!("invalid OpenAPI JSON: {error}"))?;
        let path_items = document
            .get("paths")
            .and_then(Value::as_object)
            .ok_or_else(|| "OpenAPI document is missing its paths object".to_string())?;
        let mut routes = HashMap::new();
        let mut paths = HashSet::<String>::new();

        for (path, path_item) in path_items {
            let operations = path_item
                .as_object()
                .ok_or_else(|| format!("OpenAPI path {path} is not an object"))?;
            for method in CONTRACT_METHODS {
                let Some(operation) = operations.get(method) else {
                    continue;
                };
                let operation_id = operation
                    .get("operationId")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| {
                        format!("OpenAPI operation {method} {path} has no operationId")
                    })?;
                let key = route_key(method, path);
                paths.insert(path_key(path));
                let scope = format!("contacts.{operation_id}");
                if routes.insert(key.clone(), scope).is_some() {
                    return Err(format!("OpenAPI has duplicate service-account route {key}"));
                }
            }
        }

        if routes.is_empty() {
            return Err("OpenAPI document has no service-account routes".to_string());
        }

        Ok(Self { routes, paths })
    }

    fn resolve(&self, method: &Method, path: &str) -> Option<&str> {
        let key = route_key(method.as_str(), path);
        self.routes.get(&key).map(String::as_str).or_else(|| {
            if method == Method::HEAD {
                self.routes.get(&route_key("GET", path)).map(String::as_str)
            } else {
                None
            }
        })
    }

    fn allowed_methods(&self, path: &str) -> Option<String> {
        let path = path_key(path);
        if !self.paths.contains(&path) {
            return None;
        }

        let mut methods = CONTRACT_METHODS
            .iter()
            .filter(|method| self.routes.contains_key(&route_key(method, &path)))
            .map(|method| method.to_ascii_uppercase())
            .collect::<Vec<_>>();
        if methods.iter().any(|method| method == "GET")
            && !methods.iter().any(|method| method == "HEAD")
        {
            methods.push("HEAD".to_string());
        }

        Some(methods.join(", "))
    }
}

fn route_key(method: &str, path: &str) -> String {
    format!("{} {}", method.to_ascii_uppercase(), path_key(path))
}

fn path_key(path: &str) -> String {
    let path = if path.len() > 1 && path.ends_with('/') {
        &path[..path.len() - 1]
    } else {
        path
    };
    path.to_ascii_lowercase()
}

fn has_required_scope(granted_scopes: &[String], required_scope: &str) -> bool {
    granted_scopes.iter().any(|granted| {
        granted == required_scope
            || required_scope
                .strip_prefix(granted)
                .is_some_and(|suffix| suffix.starts_with('.'))
    })
}

pub(crate) async fn enforce_service_account_scope(
    State(gate): State<ServiceAccountScopeGate>,
    request: Request,
    next: Next,
) -> Response {
    let Some(key_header) = request.headers().get(SERVICE_ACCOUNT_HEADER) else {
        return next.run(request).await;
    };
    let Ok(api_key) = key_header.to_str() else {
        return ApiError::service_account_unauthorized().into_response();
    };
    if api_key.is_empty() {
        return ApiError::service_account_unauthorized().into_response();
    }

    let Some(matched_path) = request.extensions().get::<MatchedPath>() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(required_scope) = gate.scopes.resolve(request.method(), matched_path.as_str()) else {
        let Some(allowed_methods) = gate.scopes.allowed_methods(matched_path.as_str()) else {
            tracing::error!(
                method = %request.method(),
                path = %matched_path.as_str(),
                "contacts route has no service-account scope"
            );
            return ApiError::service_account_scope_unmapped().into_response();
        };
        let mut response = StatusCode::METHOD_NOT_ALLOWED.into_response();
        response.headers_mut().insert(
            ALLOW,
            HeaderValue::from_str(&allowed_methods)
                .expect("OpenAPI methods are valid HTTP method names"),
        );
        return response;
    };

    let profile = match gate.verifier.verify(api_key).await {
        Ok(profile) => profile,
        Err(VerificationFailure::InvalidCredential) => {
            return ApiError::service_account_unauthorized().into_response();
        }
        Err(VerificationFailure::Unavailable) => {
            return ApiError::service_account_unavailable().into_response();
        }
    };

    if !has_required_scope(&profile.scopes, required_scope) {
        tracing::warn!(
            account_name = %profile.name,
            missing_scope = %required_scope,
            "contacts rejected service-account request"
        );
        return ApiError::service_account_forbidden().into_response();
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openapi::openapi_30_json;

    #[test]
    fn projects_openapi_operations_onto_contacts_scopes() {
        let scopes = ContractScopeMap::from_openapi(&openapi_30_json()).unwrap();

        assert_eq!(
            scopes.resolve(&Method::GET, "/health"),
            Some("contacts.health.get")
        );
        assert_eq!(
            scopes.resolve(&Method::GET, "/openapi"),
            Some("contacts.openapi.get")
        );
        assert_eq!(
            scopes.resolve(&Method::GET, "/entities/{id}"),
            Some("contacts.entities.get")
        );
        assert_eq!(
            scopes.resolve(&Method::HEAD, "/health"),
            Some("contacts.health.get")
        );
        assert_eq!(
            scopes.allowed_methods("/health").as_deref(),
            Some("GET, HEAD")
        );
        assert_eq!(scopes.allowed_methods("/missing"), None);
    }

    #[test]
    fn matches_only_complete_dotted_scope_segments() {
        assert!(has_required_scope(
            &["contacts.health".to_string()],
            "contacts.health.get"
        ));
        assert!(has_required_scope(
            &["contacts.health.get".to_string()],
            "contacts.health.get"
        ));
        assert!(!has_required_scope(
            &["contacts.heal".to_string()],
            "contacts.health.get"
        ));
        assert!(!has_required_scope(
            &["contacts.healthful".to_string()],
            "contacts.health.get"
        ));
    }
}
