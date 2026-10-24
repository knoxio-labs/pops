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
async fn explicit_primary_given_and_family_qualify_without_splitting_display_names() {
    use crate::persons::model::NameCompleteness;
    let fake = Fake::new(vec![(
        200,
        json!({"connections":[
        {"resourceName":"people/full","names":[
            {"displayName":"Other Display"},
            {"metadata":{"primary":true},"displayName":"Dr. Fictional Middle Example Jr.","givenName":"Fictional","middleName":"Middle","familyName":"Example","honorificPrefix":"Dr.","honorificSuffix":"Jr."}
        ]},
        {"resourceName":"people/display","names":[{"displayName":"Fictional Example"}]},
        {"resourceName":"people/given","names":[{"givenName":"Fictional Example"}]},
        {"resourceName":"people/blank","names":[{"givenName":"Fictional","familyName":"  "}]}
    ],"nextSyncToken":"terminal"}),
    )]);
    let page = sync_page(&fake, &access(), None, None, 1000).await.unwrap();
    let full = page.changes[0].row.payload.as_ref().unwrap();
    assert_eq!(full.name.completeness, NameCompleteness::Complete);
    assert_eq!(full.name.given_name.as_deref(), Some("Fictional"));
    assert_eq!(full.name.additional_names.as_deref(), Some("Middle"));
    assert_eq!(full.name.family_name.as_deref(), Some("Example"));
    assert_eq!(full.name.name_prefix.as_deref(), Some("Dr."));
    assert_eq!(full.name.name_suffix.as_deref(), Some("Jr."));
    assert_eq!(
        full.display_name.as_deref(),
        Some("Dr. Fictional Middle Example Jr.")
    );
    for change in &page.changes[1..] {
        assert_eq!(
            change.row.payload.as_ref().unwrap().name.completeness,
            NameCompleteness::Unknown
        );
    }
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
        other_contacts: false,
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
        other_contacts: false,
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

#[tokio::test]
async fn other_contacts_pages_have_separate_fields_checkpoints_and_tombstones() {
    let fake = Fake::new(vec![
        (
            200,
            json!({"otherContacts":[{"resourceName":"people/other1","emailAddresses":[{"value":"other@example.test"}]}],"nextPageToken":"second"}),
        ),
        (
            200,
            json!({"otherContacts":[{"resourceName":"people/other2","metadata":{"deleted":true}}],"nextSyncToken":"other-complete"}),
        ),
    ]);
    let page = sync_other_contacts_page(&fake, &access(), None, None, 1000)
        .await
        .unwrap();
    assert_eq!(page.changes[0].row.record_key, "people/other1");
    let PageProgress::Continue { cursor } = page.progress else {
        panic!("continuation")
    };
    assert!(matches!(
        sync_page(&fake, &access(), None, Some(&cursor), 1001).await,
        Err(GoogleError::InvalidResponse)
    ));
    let last = sync_other_contacts_page(&fake, &access(), None, Some(&cursor), 1001)
        .await
        .unwrap();
    assert!(last.changes[0].row.removed);
    let PageProgress::Complete {
        checkpoint: Some(checkpoint),
    } = last.progress
    else {
        panic!("checkpoint")
    };
    assert!(parse_checkpoint(&checkpoint).unwrap().other_contacts);
    assert!(matches!(
        sync_page(&fake, &access(), Some(&checkpoint), None, 1002).await,
        Err(GoogleError::InvalidResponse)
    ));
    assert!(matches!(
        sync_other_contacts_page(
            &fake,
            &access(),
            Some(&checkpoint),
            None,
            1000 + CHECKPOINT_LIFETIME
        )
        .await,
        Err(GoogleError::CursorExpired)
    ));
    let urls = fake.urls.lock().unwrap();
    assert_eq!(urls.len(), 2);
    for raw in &*urls {
        let url = Url::parse(raw).unwrap();
        assert_eq!(url.path(), "/v1/otherContacts");
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(
            pairs["readMask"],
            "names,emailAddresses,phoneNumbers,metadata"
        );
        assert_eq!(pairs["sources"], "READ_SOURCE_TYPE_CONTACT");
        assert_eq!(pairs["requestSyncToken"], "true");
        assert!(!pairs.contains_key("personFields"));
    }
}
