use super::*;
use crate::providers::transport::{ProviderResponseFuture, TransportError};
use serde_json::json;
use std::collections::VecDeque;
use std::sync::Mutex;

struct Fake {
    queue: Mutex<VecDeque<(u16, serde_json::Value)>>,
    urls: Mutex<Vec<String>>,
}
impl Fake {
    fn new(responses: Vec<(u16, serde_json::Value)>) -> Self {
        Self {
            queue: Mutex::new(responses.into()),
            urls: Mutex::new(Vec::new()),
        }
    }
}
impl ProviderTransport for Fake {
    fn send<'a>(&'a self, request: ProviderRequest<'a>) -> ProviderResponseFuture<'a> {
        Box::pin(async move {
            assert_eq!(request.origin, ProviderOrigin::GooglePeople);
            assert_eq!(request.method, Method::GET);
            assert_eq!(request.authorization.unwrap().expose(), b"Bearer synthetic");
            self.urls.lock().unwrap().push(request.url.to_string());
            let (status, body) = self
                .queue
                .lock()
                .unwrap()
                .pop_front()
                .ok_or(TransportError::Unavailable)?;
            ProviderResponse::new(
                reqwest::StatusCode::from_u16(status).unwrap(),
                HeaderMap::new(),
                body.to_string().into_bytes(),
            )
        })
    }
}
fn access() -> SecretBytes {
    SecretBytes::new(b"synthetic".to_vec()).unwrap()
}

#[tokio::test]
async fn multiple_pages_preserve_parameters_and_only_terminal_page_yields_checkpoint() {
    let fake = Fake::new(vec![
        (
            200,
            json!({"connections":[{"resourceName":"people/c1","names":[{"displayName":"Synthetic Person","givenName":"Synthetic"}],"emailAddresses":[{"value":"synthetic@example.test","type":"home"}]}],"nextPageToken":"second"}),
        ),
        (
            200,
            json!({"connections":[{"resourceName":"people/c2","metadata":{"deleted":true}}],"nextSyncToken":"terminal"}),
        ),
    ]);
    let first = sync_page(&fake, &access(), None, None, 1000).await.unwrap();
    assert_eq!(
        first.changes[0].row.payload.as_ref().unwrap().points[0].value,
        "synthetic@example.test"
    );
    assert_eq!(first.seen_record_keys, vec!["people/c1"]);
    let PageProgress::Continue { cursor } = first.progress else {
        panic!("first page must continue")
    };
    let last = sync_page(&fake, &access(), None, Some(&cursor), 1001)
        .await
        .unwrap();
    assert!(last.changes[0].row.removed);
    assert!(last.seen_record_keys.is_empty());
    let PageProgress::Complete {
        checkpoint: Some(checkpoint),
    } = last.progress
    else {
        panic!("terminal checkpoint required")
    };
    let checkpoint = parse_checkpoint(&checkpoint).unwrap();
    assert_eq!(checkpoint.token, "terminal");
    assert_eq!(checkpoint.full_synced_at, 1000);
    let urls = fake.urls.lock().unwrap();
    for raw in &*urls {
        let url = Url::parse(raw).unwrap();
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(pairs["sources"], "READ_SOURCE_TYPE_CONTACT");
        assert_eq!(pairs["pageSize"], "1000");
        assert_eq!(pairs["requestSyncToken"], "true");
        assert!(!pairs.contains_key("syncToken"));
    }
    assert!(urls[1].contains("pageToken=second"));
}

#[tokio::test]
async fn incremental_cursor_expiry_keeps_original_full_anchor_and_requires_reset() {
    let fake = Fake::new(vec![(200, json!({"nextSyncToken":"next"}))]);
    let checkpoint = serde_json::to_string(&Checkpoint {
        token: "old".to_string(),
        full_synced_at: 1000,
    })
    .unwrap();
    let page = sync_page(&fake, &access(), Some(&checkpoint), None, 1001)
        .await
        .unwrap();
    let PageProgress::Complete {
        checkpoint: Some(next),
    } = page.progress
    else {
        panic!("checkpoint")
    };
    assert_eq!(parse_checkpoint(&next).unwrap().full_synced_at, 1000);
    assert!(matches!(
        sync_page(
            &fake,
            &access(),
            Some(&next),
            None,
            1000 + CHECKPOINT_LIFETIME
        )
        .await,
        Err(GoogleError::CursorExpired)
    ));
    assert_eq!(fake.urls.lock().unwrap().len(), 1);
    let expired = Fake::new(vec![(
        400,
        json!({"error":{"details":[{"reason":"EXPIRED_SYNC_TOKEN"}]}}),
    )]);
    assert!(matches!(
        sync_page(&expired, &access(), Some(&checkpoint), None, 1001).await,
        Err(GoogleError::CursorExpired)
    ));
}

#[tokio::test]
async fn malformed_pages_repeated_tokens_and_cross_checkpoint_continuations_fail() {
    let fake = Fake::new(vec![
        (200, json!({"nextPageToken":"repeat"})),
        (200, json!({"nextPageToken":"repeat"})),
        (
            200,
            json!({"connections":[{"resourceName":"bad"}],"nextSyncToken":"done"}),
        ),
        (200, json!({"nextPageToken":"both","nextSyncToken":"both"})),
    ]);
    let page = sync_page(&fake, &access(), None, None, 1000).await.unwrap();
    let PageProgress::Continue { cursor } = page.progress else {
        panic!("cursor")
    };
    assert!(matches!(
        sync_page(&fake, &access(), None, Some(&cursor), 1001).await,
        Err(GoogleError::InvalidResponse)
    ));
    assert!(sync_page(&fake, &access(), None, None, 1000).await.is_err());
    assert!(sync_page(&fake, &access(), None, None, 1000).await.is_err());
    let checkpoint = serde_json::to_string(&Checkpoint {
        token: "other".to_string(),
        full_synced_at: 1000,
    })
    .unwrap();
    assert!(
        sync_page(&fake, &access(), Some(&checkpoint), Some(&cursor), 1001)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn rate_limit_authentication_and_stable_self_identity_are_distinct() {
    let fake = Fake::new(vec![
        (429, json!({})),
        (401, json!({})),
        (200, json!({"resourceName":"people/12345"})),
    ]);
    assert!(matches!(
        sync_page(&fake, &access(), None, None, 1000).await,
        Err(GoogleError::Retryable(_))
    ));
    assert!(matches!(
        sync_page(&fake, &access(), None, None, 1000).await,
        Err(GoogleError::ReauthorizationRequired)
    ));
    assert_eq!(account_key(&fake, &access()).await.unwrap(), "people/12345");
}
