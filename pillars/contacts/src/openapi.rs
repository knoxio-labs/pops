//! OpenAPI document generation, pinned to **OpenAPI 3.0.3**.
//!
//! ## Why a downgrade pass exists
//!
//! utoipa 5 emits OpenAPI **3.1** by default, but the repo's client
//! generator (`@hey-api/openapi-ts`, the same pipeline every TS pillar's
//! frontend uses) targets **3.0**. A 3.1 document breaks client generation.
//! The TS pillars solve this with `z.toJSONSchema({ target: 'openapi-3.0' })`;
//! the Rust side mirrors that intent with a deterministic post-process pass
//! that rewrites the serialized document to a 3.0.3 shape. The two 3.1→3.0
//! shape differences utoipa can emit are handled:
//!
//!   - `type: ["string", "null"]` (3.1 nullable union) → `type: "string"` +
//!     `nullable: true` (3.0 keyword).
//!   - `examples` (3.1 array) → `example` (3.0 singular) on schema objects.
//!
//! The `openapi` version field is forced to `3.0.3`. `emit-openapi` writes
//! the result to `openapi/contacts.openapi.json`; a drift check (regenerate
//! + `git diff --exit-code`) keeps the committed copy honest.

use serde_json::{Map, Value};
use utoipa::OpenApi;

use crate::api::{ErrorBody, PaginationMeta};
use crate::entities::model::{CreateEntityBody, Entity, EntityLookup, UpdateEntityBody};
use crate::entities::routes::{
    EntityListResponse, EntityMutation, EntityResponse, LookupBody, LookupResponse, MessageResponse,
};
use crate::health::HealthResponse;
use crate::search::routes::{
    MatchType, SearchHit, SearchHitData, SearchQuery, SearchRequest, SearchResponse,
};

/// The contacts OpenAPI surface. Documents `/health`, the stub root, the
/// entities CRUD + bulk-lookup routes (DOTTED `entities.*` operationIds), and
/// the search slice (`search.search`). The registry/uri/settings paths join in
/// later nodes.
///
/// Path handlers are referenced fully-qualified so the `OpenApi` derive
/// resolves the `__path_*` items `#[utoipa::path]` generates in their defining
/// module.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "POPS Contacts",
        description = "Contacts pillar — authoritative entities store (first Rust pillar)."
    ),
    paths(
        crate::health::health,
        crate::health::root,
        crate::entities::routes::list,
        crate::entities::routes::get_one,
        crate::entities::routes::create,
        crate::entities::routes::update,
        crate::entities::routes::reroll_colour,
        crate::entities::routes::delete_one,
        crate::entities::routes::lookup,
        crate::entities::routes::upload_avatar,
        crate::entities::routes::get_avatar,
        crate::entities::routes::remove_avatar,
        crate::entities::routes::upload_poster,
        crate::entities::routes::get_poster,
        crate::entities::routes::remove_poster,
        crate::search::routes::search,
    ),
    components(schemas(
        HealthResponse,
        Entity,
        EntityLookup,
        CreateEntityBody,
        UpdateEntityBody,
        EntityListResponse,
        EntityResponse,
        EntityMutation,
        MessageResponse,
        LookupBody,
        LookupResponse,
        PaginationMeta,
        ErrorBody,
        SearchRequest,
        SearchQuery,
        SearchResponse,
        SearchHit,
        SearchHitData,
        MatchType,
    ))
)]
pub struct ApiDoc;

/// The OpenAPI version string every emitted/served document is pinned to.
pub const OPENAPI_VERSION: &str = "3.0.3";

/// Render the OpenAPI document as a 3.0.3 `serde_json::Value`.
pub fn openapi_30_value() -> Value {
    let mut doc =
        serde_json::to_value(ApiDoc::openapi()).expect("utoipa OpenApi serializes to a JSON value");
    downgrade_to_30(&mut doc);
    doc
}

/// Render the 3.0.3 document as deterministic pretty JSON with a trailing
/// newline (so the committed file is diff-stable across regenerations).
pub fn openapi_30_json() -> String {
    let value = openapi_30_value();
    let mut json =
        serde_json::to_string_pretty(&value).expect("3.0 OpenAPI value serializes to pretty JSON");
    json.push('\n');
    json
}

/// Force the top-level `openapi` field to 3.0.3 and recursively rewrite the
/// schema tree to the 3.0 dialect.
fn downgrade_to_30(doc: &mut Value) {
    if let Value::Object(map) = doc {
        map.insert(
            "openapi".to_string(),
            Value::String(OPENAPI_VERSION.to_string()),
        );
    }
    rewrite_schema_node(doc);
}

/// Recursively convert 3.1-only schema constructs to their 3.0 equivalents.
fn rewrite_schema_node(node: &mut Value) {
    match node {
        Value::Object(map) => {
            rewrite_nullable_type_union(map);
            rewrite_examples_to_example(map);
            for value in map.values_mut() {
                rewrite_schema_node(value);
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                rewrite_schema_node(item);
            }
        }
        _ => {}
    }
}

/// `type: ["string", "null"]` → `type: "string"` + `nullable: true`.
fn rewrite_nullable_type_union(map: &mut Map<String, Value>) {
    let Some(Value::Array(variants)) = map.get("type") else {
        return;
    };
    let has_null = variants
        .iter()
        .any(|v| v == &Value::String("null".to_string()));
    if !has_null {
        return;
    }
    let concrete: Vec<Value> = variants
        .iter()
        .filter(|v| *v != &Value::String("null".to_string()))
        .cloned()
        .collect();
    if let [single] = concrete.as_slice() {
        map.insert("type".to_string(), single.clone());
        map.insert("nullable".to_string(), Value::Bool(true));
    }
}

/// `examples: [x, …]` → `example: x` (3.0 schema objects carry a singular
/// `example`, not the 3.1 `examples` array).
fn rewrite_examples_to_example(map: &mut Map<String, Value>) {
    let Some(Value::Array(examples)) = map.get("examples") else {
        return;
    };
    if let Some(first) = examples.first().cloned() {
        map.insert("example".to_string(), first);
    }
    map.remove("examples");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emitted_document_is_openapi_30() {
        let value = openapi_30_value();
        let version = value
            .get("openapi")
            .and_then(Value::as_str)
            .expect("openapi field is a string");
        assert!(
            version.starts_with("3.0"),
            "OpenAPI must be 3.0.x for hey-api, got {version}"
        );
        assert_eq!(version, OPENAPI_VERSION);
    }

    #[test]
    fn document_advertises_the_health_path() {
        let value = openapi_30_value();
        assert!(
            value.pointer("/paths/~1health").is_some(),
            "/health path must be present in the OpenAPI document"
        );
    }

    #[test]
    fn json_output_is_stable_and_newline_terminated() {
        let first = openapi_30_json();
        let second = openapi_30_json();
        assert_eq!(first, second, "emission must be deterministic");
        assert!(first.ends_with('\n'), "committed JSON ends with a newline");
    }

    #[test]
    fn no_31_style_nullable_type_union_remains() {
        let json = openapi_30_json();
        assert!(
            !json.contains("\"null\""),
            "3.0 documents express nullability via the `nullable` keyword, not a null type"
        );
    }

    /// Collect every `application/octet-stream` schema in the document,
    /// wherever it sits — request bodies and responses alike — paired with the
    /// JSON pointer it was found at, so a failure names the offending route.
    fn octet_stream_schemas(node: &Value, path: String, found: &mut Vec<(String, Value)>) {
        match node {
            Value::Object(map) => {
                for (key, value) in map {
                    let child = format!("{path}/{key}");
                    if key == "application/octet-stream" {
                        if let Some(schema) = value.get("schema") {
                            found.push((child.clone(), schema.clone()));
                        }
                    }
                    octet_stream_schemas(value, child, found);
                }
            }
            Value::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    octet_stream_schemas(item, format!("{path}/{index}"), found);
                }
            }
            _ => {}
        }
    }

    /// A bare `Vec<u8>` is documented as `{ type: "array", items: { type:
    /// "integer" } }`, which hey-api projects to `Array<number>`. The
    /// generated wrappers pass `body` to `fetch` unserialized and a number
    /// array is not valid `BodyInit`, so `Request` stringifies it and the
    /// upload stores the bytes of `"137,80,78,71,…"` instead of the image
    /// (POPS-3091). Every binary payload must be `string`/`binary`.
    #[test]
    fn octet_stream_payloads_are_binary_strings_not_integer_arrays() {
        let value = openapi_30_value();
        let mut found = Vec::new();
        octet_stream_schemas(&value, String::new(), &mut found);

        assert!(
            !found.is_empty(),
            "expected the document to carry octet-stream payloads (the entity avatar/poster routes)"
        );

        for (pointer, schema) in found {
            assert_eq!(
                schema.get("type"),
                Some(&Value::String("string".to_string())),
                "{pointer} must be a binary string, not {schema}"
            );
            assert_eq!(
                schema.get("format"),
                Some(&Value::String("binary".to_string())),
                "{pointer} must declare format: binary, not {schema}"
            );
            assert!(
                schema.get("items").is_none(),
                "{pointer} must not be an array schema — that is the Vec<u8> projection"
            );
        }
    }

    /// The four routes the guard above is protecting. Without this, deleting
    /// the avatar and poster routes outright would leave the guard passing on
    /// an empty set — its `!found.is_empty()` only proves *something* binary
    /// is documented, not that these are.
    #[test]
    fn both_asset_routes_document_binary_uploads_and_downloads() {
        let value = openapi_30_value();
        for asset in ["avatar", "poster"] {
            for (method, pointer) in [
                ("put", format!("/paths/~1entities~1{{id}}~1{asset}/put/requestBody/content/application~1octet-stream/schema")),
                ("get", format!("/paths/~1entities~1{{id}}~1{asset}/get/responses/200/content/application~1octet-stream/schema")),
            ] {
                let schema = value
                    .pointer(&pointer)
                    .unwrap_or_else(|| panic!("{method} /entities/{{id}}/{asset} must document an octet-stream payload at {pointer}"));
                assert_eq!(schema.get("format"), Some(&Value::String("binary".to_string())));
            }
        }
    }

    #[test]
    fn nullable_union_is_rewritten_to_30_keyword() {
        let mut node = serde_json::json!({ "type": ["string", "null"] });
        rewrite_schema_node(&mut node);
        assert_eq!(node["type"], serde_json::json!("string"));
        assert_eq!(node["nullable"], serde_json::json!(true));
    }
}
