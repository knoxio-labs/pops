//! Static remote app assets served separately from the contacts API.

use std::path::{Component, Path as FilePath, PathBuf};

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, Response, StatusCode};
use axum::routing::get;
use axum::Router;

fn read_asset(root: &FilePath, requested: &str) -> Result<(&'static str, Vec<u8>), StatusCode> {
    let path = FilePath::new(requested);
    if path
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
        || requested.contains('\\')
    {
        return Err(StatusCode::NOT_FOUND);
    }
    let content_type = match path.extension().and_then(|value| value.to_str()) {
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        _ => return Err(StatusCode::NOT_FOUND),
    };
    let root = root.canonicalize().map_err(|_| StatusCode::NOT_FOUND)?;
    let resolved = root
        .join(path)
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !resolved.starts_with(&root) {
        return Err(StatusCode::NOT_FOUND);
    }
    let bytes = std::fs::read(resolved).map_err(|_| StatusCode::NOT_FOUND)?;
    Ok((content_type, bytes))
}

async fn asset(
    State(root): State<PathBuf>,
    Path(path): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let (content_type, bytes) = tokio::task::spawn_blocking(move || read_asset(&root, &path))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Serve generated JS/CSS beneath `/ui` without a fallback that could shadow API routes.
/// Every resolved path must remain inside `root`, including symbolic links.
pub fn router(root: PathBuf) -> Router {
    Router::new()
        .route("/ui/{*path}", get(asset))
        .with_state(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn serves_only_contained_assets_with_browser_headers() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../tmp")
            .join(format!("contacts-ui-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("contacts.js"), "export const bundles = {};").unwrap();
        std::fs::write(root.join("contacts.css"), ".test {}").unwrap();
        std::fs::write(root.join("private.json"), "{}").unwrap();
        for (path, status, content_type) in [
            (
                "/ui/contacts.js",
                StatusCode::OK,
                Some("text/javascript; charset=utf-8"),
            ),
            (
                "/ui/contacts.css",
                StatusCode::OK,
                Some("text/css; charset=utf-8"),
            ),
            ("/ui/private.json", StatusCode::NOT_FOUND, None),
            ("/ui/%2e%2e/Cargo.toml", StatusCode::NOT_FOUND, None),
            ("/ui/%2fetc%2fpasswd.js", StatusCode::NOT_FOUND, None),
            ("/entities", StatusCode::NOT_FOUND, None),
            ("/ui/missing.js", StatusCode::NOT_FOUND, None),
        ] {
            let response = router(root.clone())
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), status, "{path}");
            if let Some(content_type) = content_type {
                assert_eq!(response.headers()[header::CONTENT_TYPE], content_type);
                assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
                assert_eq!(
                    response.headers()[header::X_CONTENT_TYPE_OPTIONS],
                    "nosniff"
                );
            }
        }
        assert!(read_asset(&root, "../contacts.js").is_err());
        assert!(read_asset(&root, "..\\contacts.js").is_err());
        #[cfg(unix)]
        {
            let outside = root.with_extension("js");
            std::os::unix::fs::symlink(&outside, root.join("link.js")).unwrap();
            std::fs::write(&outside, "private").unwrap();
            assert!(read_asset(&root, "link.js").is_err());
            std::fs::remove_file(outside).unwrap();
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
