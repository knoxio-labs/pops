use super::management::bind_google_subject;
use super::*;
use crate::providers::credentials::SecretBytes;
use crate::providers::human_auth::HumanIdentity;
use crate::providers::oauth_state::begin_authorization;
use crate::providers::store::{self, AccountEpoch};
use crate::providers::sync::{self, CollectionPlan, PageProgress, ProviderPage};
use crate::providers::transport::{
    ProviderRequest, ProviderResponse, ProviderResponseFuture, TransportError,
};
use crate::sources::model::SourceAccountInput;
use crate::sources::repo::create_or_get_account;
use reqwest::{header::HeaderMap, StatusCode};
use serde_json::json;
use sqlx::SqlitePool;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;
use std::time::Duration;

#[derive(Default)]
struct Fake {
    replies: Mutex<VecDeque<(u16, String)>>,
    urls: Mutex<Vec<String>>,
    gate: Mutex<Option<(Arc<tokio::sync::Notify>, Arc<tokio::sync::Notify>)>>,
}
impl ProviderTransport for Fake {
    fn send<'a>(&'a self, request: ProviderRequest<'a>) -> ProviderResponseFuture<'a> {
        Box::pin(async move {
            self.urls.lock().unwrap().push(request.url.to_string());
            let (status, body) = self
                .replies
                .lock()
                .unwrap()
                .pop_front()
                .ok_or(TransportError::Unavailable)?;
            let gate = { self.gate.lock().unwrap().take() };
            if let Some((entered, release)) = gate {
                entered.notify_one();
                release.notified().await;
            }
            ProviderResponse::new(
                StatusCode::from_u16(status).unwrap(),
                HeaderMap::new(),
                body.into_bytes(),
            )
        })
    }
}
#[derive(Default)]
struct Delay(Mutex<Vec<Duration>>);
impl RetryDelay for Delay {
    fn wait(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        self.0.lock().unwrap().push(duration);
        Box::pin(async {})
    }
}
fn secret() -> SecretBytes {
    SecretBytes::new(vec![b'x'; 20]).unwrap()
}
fn runtime(fake: Arc<Fake>) -> ProviderRuntime {
    ProviderRuntime::new(
        CredentialCipher::for_test(),
        HumanAccessVerifier::new("fictional", "fictional-audience", "operator@example.test")
            .unwrap(),
        Some(
            GoogleOAuthConfig::new(
                "fictional".into(),
                secret(),
                "https://contacts.example.test/providers/google/callback",
            )
            .unwrap(),
        ),
        fake,
        Arc::new(Delay::default()),
    )
}
async fn setup(
    provider: &str,
    key: &str,
) -> (SqlitePool, ProviderRuntime, Arc<Fake>, String, AccountEpoch) {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let fake = Arc::new(Fake::default());
    let runtime = runtime(fake.clone());
    let source = create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: provider.into(),
            account_key: key.into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let human = HumanIdentity::for_test("operator");
    let epoch = store::prepare_account(&pool, &human, &source.id)
        .await
        .unwrap();
    let epoch =
        store::install_credential(&pool, &runtime.cipher, &human, &source.id, epoch, &secret())
            .await
            .unwrap();
    (pool, runtime, fake, source.id, epoch)
}
fn token() -> String {
    json!({"access_token":"fictional-access","token_type":"Bearer","expires_in":3600}).to_string()
}
async fn begin(pool: &SqlitePool, id: &str, epoch: AccountEpoch) -> String {
    sync::begin_sync(
        pool,
        id,
        epoch,
        &[CollectionPlan {
            key: "contacts".into(),
            full_snapshot: true,
        }],
    )
    .await
    .unwrap()
    .id
}
fn complete() -> ProviderPage {
    ProviderPage {
        changes: vec![],
        seen_record_keys: vec![],
        progress: PageProgress::Complete {
            checkpoint: Some("fictional-checkpoint".into()),
        },
    }
}

#[tokio::test]
async fn worker_restart_resumes_pages_and_finalizes_once() {
    let (pool, first, fake, id, epoch) = setup("google", "people/one").await;
    let run_id = begin(&pool, &id, epoch).await;
    fake.replies.lock().unwrap().extend([(200,token()),(200,json!({"connections":[{"resourceName":"people/c1","names":[{"displayName":"Fictional Person"}]}],"nextPageToken":"second"}).to_string())]);
    assert!(first.work_once(&pool).await.unwrap());
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
    let second = runtime(fake.clone());
    fake.replies.lock().unwrap().extend([
        (200, token()),
        (200, json!({"nextSyncToken":"complete"}).to_string()),
    ]);
    assert!(second.work_once(&pool).await.unwrap());
    assert!(second.work_once(&pool).await.unwrap());
    assert!(!second.work_once(&pool).await.unwrap());
    assert_eq!(
        sync::get_run(&pool, &run_id).await.unwrap().status,
        "completed"
    );
    assert!(fake
        .urls
        .lock()
        .unwrap()
        .iter()
        .any(|url| url.contains("pageToken=second")));
    let batches: i64 =
        sqlx::query_scalar("SELECT count(*) FROM provider_batch_guards WHERE run_id=?1")
            .bind(&run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(batches, 1);
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn revoked_refresh_pauses_scheduling_and_retains_previous_data() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    let run_id = begin(&pool, &id, epoch).await;
    fake.replies.lock().unwrap().push_back((
        400,
        json!({"error":"invalid_grant","error_description":"never expose this"}).to_string(),
    ));
    runtime.work_once(&pool).await.unwrap();
    assert_eq!(
        sync::get_run(&pool, &run_id).await.unwrap().status,
        "failed"
    );
    let paused: bool = sqlx::query_scalar(
        "SELECT reauthorization_required FROM provider_accounts WHERE account_id=?1",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(paused);
    assert!(matches!(
        runtime.start_sync(&pool, &id).await,
        Err(ProviderError::Reauthorize)
    ));
    assert_eq!(fake.urls.lock().unwrap().len(), 1);
    assert!(store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .is_ok());
}

#[tokio::test]
async fn repeated_transient_failures_have_durable_delay_and_total_budget() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    let run_id = begin(&pool, &id, epoch).await;
    for attempt in 0..5 {
        fake.replies
            .lock()
            .unwrap()
            .extend((0..3).map(|_| (429, "{}".into())));
        runtime.work_once(&pool).await.unwrap();
        assert!(!runtime.work_once(&pool).await.unwrap());
        let run = sync::get_run(&pool, &run_id).await.unwrap();
        assert_eq!(run.status, if attempt == 4 { "failed" } else { "running" });
        sqlx::query("UPDATE provider_sync_runs SET next_attempt_at=0 WHERE id=?1")
            .bind(&run_id)
            .execute(&pool)
            .await
            .unwrap();
    }
    assert_eq!(fake.urls.lock().unwrap().len(), 15);
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn expired_claim_cannot_stage_or_fail_after_another_worker_reclaims() {
    let (pool, _, _, id, epoch) = setup("google", "people/one").await;
    begin(&pool, &id, epoch).await;
    let old = sync::lease::claim(&pool, 100).await.unwrap().unwrap();
    assert!(sync::lease::claim(&pool, 399).await.unwrap().is_none());
    let current = sync::lease::claim(&pool, 400).await.unwrap().unwrap();
    assert_eq!(
        sync::service::stage_page_claimed(&pool, &old, "contacts", None, &complete(), 400).await,
        Err(SyncError::Conflict)
    );
    assert_eq!(
        sync::lease::fail(
            &pool,
            &old,
            "CONTACTS_PROVIDER_INVALID_RESPONSE",
            false,
            400
        )
        .await,
        Err(SyncError::Conflict)
    );
    sync::service::stage_page_claimed(&pool, &current, "contacts", None, &complete(), 400)
        .await
        .unwrap();
    sync::finalize_claimed(&pool, &current, 400).await.unwrap();
    assert_eq!(
        sync::checkpoint(&pool, &id, "contacts")
            .await
            .unwrap()
            .as_deref(),
        Some("fictional-checkpoint")
    );
}

#[tokio::test]
async fn full_reset_discards_only_staging_and_is_bounded_to_one_reset() {
    let (pool, _, _, id, epoch) = setup("google", "people/one").await;
    let run = begin(&pool, &id, epoch).await;
    let lease = sync::lease::claim(&pool, 100).await.unwrap().unwrap();
    sync::lease::reset_full(&pool, &lease, "contacts", 101)
        .await
        .unwrap();
    assert_eq!(
        sync::lease::reset_full(&pool, &lease, "contacts", 102).await,
        Err(SyncError::InvalidPage)
    );
    let stored = sync::get_run(&pool, &run).await.unwrap();
    assert!(stored.collections[0].full_snapshot);
    assert!(stored.collections[0].checkpoint.is_none());
}

#[tokio::test]
async fn reconnect_as_different_google_subject_never_replaces_original_credentials() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    let human = HumanIdentity::for_test("operator");
    let attempt = begin_authorization(&pool, &runtime.cipher, &human, &id, epoch, 100)
        .await
        .unwrap();
    fake.replies.lock().unwrap().extend([(200,json!({"access_token":"fictional-access","refresh_token":"fictional-other-refresh","token_type":"Bearer","expires_in":3600,"scope":crate::providers::google::oauth::CONTACTS_READ_ONLY}).to_string()),(200,json!({"resourceName":"people/other"}).to_string())]);
    assert_eq!(
        runtime
            .finish_google(&pool, &human, &attempt.state, &secret(), 101)
            .await,
        Err(ProviderError::IdentityMismatch)
    );
    let current = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert_eq!(current.epoch, epoch);
    assert_eq!(current.secret.expose(), secret().expose());
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
    assert_eq!(
        runtime
            .finish_google(&pool, &human, &attempt.state, &secret(), 101)
            .await,
        Err(ProviderError::Conflict)
    );
}

#[tokio::test]
async fn provisional_google_namespace_cannot_replace_a_bound_or_populated_account() {
    let (pool, _, _, id, epoch) = setup("google", "pending:fictional").await;
    assert_eq!(
        bind_google_subject(&pool, &id, epoch, "people/other").await,
        Err(ProviderError::IdentityMismatch)
    );
}

#[tokio::test]
async fn disconnect_during_refresh_cancels_run_without_saving_credentials_or_results() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    let runtime = Arc::new(runtime);
    let run_id = begin(&pool, &id, epoch).await;
    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    *fake.gate.lock().unwrap() = Some((entered.clone(), release.clone()));
    fake.replies.lock().unwrap().push_back((200, token()));
    let worker = {
        let pool = pool.clone();
        let runtime = runtime.clone();
        tokio::spawn(async move { runtime.work_once(&pool).await })
    };
    entered.notified().await;
    store::disconnect_account(&pool, &HumanIdentity::for_test("operator"), &id)
        .await
        .unwrap();
    release.notify_one();
    worker.await.unwrap().unwrap();
    assert_eq!(
        sync::get_run(&pool, &run_id).await.unwrap().status,
        "cancelled"
    );
    assert!(store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .is_err());
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
    assert_eq!(fake.urls.lock().unwrap().len(), 1);
}

fn dav(properties: &str) -> String {
    format!("<d:multistatus xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:carddav\"><d:response><d:href>/</d:href><d:propstat><d:prop>{properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>")
}
fn discovery(principal: &str) -> [(u16, String); 3] {
    [(207,dav(&format!("<d:current-user-principal><d:href>{principal}</d:href></d:current-user-principal>"))),
    (207,dav("<c:addressbook-home-set><d:href>https://contacts.icloud.com/home/</d:href></c:addressbook-home-set>")),
    (207,dav("<d:resourcetype><d:collection/></d:resourcetype>").replace("<d:href>/</d:href>","<d:href>https://contacts.icloud.com/home/</d:href>"))]
}

#[tokio::test]
async fn reconnect_as_different_icloud_principal_preserves_original_account_and_epoch() {
    let (pool, runtime, fake, id, epoch) =
        setup("icloud", "https://contacts.icloud.com/one/principal/").await;
    fake.replies
        .lock()
        .unwrap()
        .extend(discovery("https://contacts.icloud.com/two/principal/"));
    let credential = crate::providers::carddav::credential::CardDavCredential::new(
        "fictional@example.test".into(),
        secret(),
    )
    .unwrap();
    assert_eq!(
        runtime
            .connect_icloud(
                &pool,
                &HumanIdentity::for_test("operator"),
                Some(&id),
                &credential,
                None
            )
            .await,
        Err(ProviderError::IdentityMismatch)
    );
    let current = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert_eq!(current.epoch, epoch);
    assert_eq!(current.secret.expose(), secret().expose());
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn new_google_authorization_binds_real_identity_and_installs_only_refresh_material() {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let fake = Arc::new(Fake::default());
    let runtime = runtime(fake.clone());
    let human = HumanIdentity::for_test("operator");
    let location = runtime
        .begin_google(&pool, &human, None, None, 100, false)
        .await
        .unwrap();
    let url = reqwest::Url::parse(location.expose()).unwrap();
    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .unwrap()
        .1
        .into_owned();
    fake.replies.lock().unwrap().extend([(200,json!({"access_token":"fictional-access","refresh_token":"fictional-persisted-refresh","token_type":"Bearer","expires_in":3600,"scope":crate::providers::google::oauth::CONTACTS_READ_ONLY}).to_string()),(200,json!({"resourceName":"people/new"}).to_string())]);
    let id = runtime
        .finish_google(
            &pool,
            &human,
            &SecretBytes::new(state.into_bytes()).unwrap(),
            &secret(),
            101,
        )
        .await
        .unwrap();
    let key: String = sqlx::query_scalar("SELECT account_key FROM source_accounts WHERE id=?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(key, "people/new");
    let saved = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert_eq!(saved.secret.expose(), b"fictional-persisted-refresh");
}

#[tokio::test]
async fn new_icloud_flow_verifies_principal_and_cannot_implicitly_reconnect_an_existing_namespace()
{
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let fake = Arc::new(Fake::default());
    let runtime = runtime(fake.clone());
    let human = HumanIdentity::for_test("operator");
    let credential = crate::providers::carddav::credential::CardDavCredential::new(
        "fictional@example.test".into(),
        secret(),
    )
    .unwrap();
    fake.replies
        .lock()
        .unwrap()
        .extend(discovery("https://contacts.icloud.com/one/principal/"));
    let id = runtime
        .connect_icloud(&pool, &human, None, &credential, None)
        .await
        .unwrap();
    store::disconnect_account(&pool, &human, &id).await.unwrap();
    fake.replies
        .lock()
        .unwrap()
        .extend(discovery("https://contacts.icloud.com/one/principal/"));
    assert_eq!(
        runtime
            .connect_icloud(&pool, &human, None, &credential, None)
            .await,
        Err(ProviderError::Conflict)
    );
    assert!(store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .is_err());
}

#[tokio::test]
async fn explicit_other_contacts_consent_persists_and_stages_distinct_streams_atomically() {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let fake = Arc::new(Fake::default());
    let runtime = runtime(fake.clone());
    let human = HumanIdentity::for_test("operator");
    let location = runtime
        .begin_google(&pool, &human, None, None, 100, true)
        .await
        .unwrap();
    let url = reqwest::Url::parse(location.expose()).unwrap();
    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .unwrap()
        .1
        .into_owned();
    assert!(url
        .query_pairs()
        .find(|(key, _)| key == "scope")
        .unwrap()
        .1
        .contains(crate::providers::google::oauth::OTHER_CONTACTS_READ_ONLY));
    fake.replies.lock().unwrap().extend([(200,json!({"access_token":"fictional-access","refresh_token":"fictional-refresh","token_type":"Bearer","expires_in":3600,"scope":format!("{} {}",crate::providers::google::oauth::OTHER_CONTACTS_READ_ONLY,crate::providers::google::oauth::CONTACTS_READ_ONLY)}).to_string()),(200,json!({"resourceName":"people/new"}).to_string())]);
    let id = runtime
        .finish_google(
            &pool,
            &human,
            &SecretBytes::new(state.into_bytes()).unwrap(),
            &secret(),
            101,
        )
        .await
        .unwrap();
    let saved = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert!(saved.include_other_contacts);
    fake.replies.lock().unwrap().extend([
        (200, token()),
        (200, json!({"resourceName":"people/new"}).to_string()),
    ]);
    let run = runtime.start_sync(&pool, &id).await.unwrap();
    assert_eq!(run.collections.len(), 2);
    fake.replies.lock().unwrap().extend([(200,token()),(200,json!({"connections":[{"resourceName":"people/shared","names":[{"displayName":"Fictional"}]}],"nextSyncToken":"connections-token"}).to_string())]);
    runtime.work_once(&pool).await.unwrap();
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_none());
    fake.replies.lock().unwrap().extend([(200,token()),(200,json!({"otherContacts":[{"resourceName":"people/shared","names":[{"displayName":"Fictional"}]}],"nextSyncToken":"other-token"}).to_string())]);
    runtime.work_once(&pool).await.unwrap();
    runtime.work_once(&pool).await.unwrap();
    assert_eq!(
        sync::get_run(&pool, &run.id).await.unwrap().status,
        "completed"
    );
    assert!(sync::checkpoint(&pool, &id, "contacts")
        .await
        .unwrap()
        .is_some());
    assert!(sync::checkpoint(&pool, &id, "other_contacts")
        .await
        .unwrap()
        .is_some());
    let records:i64=sqlx::query_scalar("SELECT count(*) FROM provider_records WHERE account_id=?1 AND record_key='people/shared' AND active=1").bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!(records, 2);
    let directory: i64 = sqlx::query_scalar("SELECT count(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(directory, 0);
    let original_epoch = saved.epoch;
    let new_epoch = store::install_google_credential(
        &pool,
        &runtime.cipher,
        &human,
        &id,
        original_epoch,
        &saved.secret,
        false,
    )
    .await
    .unwrap();
    assert!(new_epoch.0 > original_epoch.0);
    assert!(
        !store::load_credential(&pool, &runtime.cipher, &id)
            .await
            .unwrap()
            .include_other_contacts
    );
}

#[tokio::test]
async fn a_busy_refresh_releases_job_ownership_without_consuming_retry_budget() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    let run = begin(&pool, &id, epoch).await;
    let refresh = store::claim_refresh(&pool, &id, epoch, super::now())
        .await
        .unwrap();
    assert!(runtime.work_once(&pool).await.unwrap());
    let (until, attempts): (i64, i64) =
        sqlx::query_as("SELECT lease_until,attempt_count FROM provider_sync_runs WHERE id=?1")
            .bind(&run)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((until, attempts), (0, 0));
    assert!(fake.urls.lock().unwrap().is_empty());
    store::release_refresh(&pool, &refresh).await.unwrap();
    fake.replies.lock().unwrap().extend([
        (200, token()),
        (200, json!({"nextSyncToken":"complete"}).to_string()),
    ]);
    assert!(runtime.work_once(&pool).await.unwrap());
    assert!(runtime.work_once(&pool).await.unwrap());
    assert_eq!(
        sync::get_run(&pool, &run).await.unwrap().status,
        "completed"
    );
}

#[tokio::test]
async fn fresh_human_consent_can_replace_a_credential_that_the_current_root_key_cannot_read() {
    let (pool, runtime, fake, id, epoch) = setup("google", "people/one").await;
    sqlx::query("UPDATE provider_accounts SET credential=?1 WHERE account_id=?2")
        .bind(vec![0u8])
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
    let human = HumanIdentity::for_test("operator");
    let attempt = begin_authorization(&pool, &runtime.cipher, &human, &id, epoch, 100)
        .await
        .unwrap();
    fake.replies.lock().unwrap().extend([(200,json!({"access_token":"fictional-access","refresh_token":"fictional-reconnected-refresh","token_type":"Bearer","expires_in":3600,"scope":crate::providers::google::oauth::CONTACTS_READ_ONLY}).to_string()),(200,json!({"resourceName":"people/one"}).to_string())]);
    assert_eq!(
        runtime
            .finish_google(&pool, &human, &attempt.state, &secret(), 101)
            .await
            .unwrap(),
        id
    );
    let current = store::load_credential(&pool, &runtime.cipher, &id)
        .await
        .unwrap();
    assert!(current.epoch.0 > epoch.0);
    assert_eq!(current.secret.expose(), b"fictional-reconnected-refresh");
}

#[tokio::test]
async fn incomplete_icloud_discovery_cannot_replace_existing_cache_checkpoint_or_preview() {
    let principal = "https://contacts.icloud.com/one/principal/";
    let (pool, runtime, fake, id, epoch) = setup("icloud", principal).await;
    let credential = crate::providers::carddav::credential::CardDavCredential::new(
        "fictional@example.test".into(),
        secret(),
    )
    .unwrap();
    let epoch = store::install_credential(
        &pool,
        &runtime.cipher,
        &HumanIdentity::for_test("operator"),
        &id,
        epoch,
        &credential.encode(),
    )
    .await
    .unwrap();
    let book = "https://contacts.icloud.com/home/book/";
    let run = sync::begin_sync(
        &pool,
        &id,
        epoch,
        &[CollectionPlan {
            key: book.into(),
            full_snapshot: true,
        }],
    )
    .await
    .unwrap();
    sync::stage_page(
        &pool,
        &run.id,
        book,
        None,
        &ProviderPage {
            changes: vec![sync::ProviderChange {
                row: crate::imports::model::StageRowInput {
                    record_key: "one".into(),
                    payload: Some(crate::imports::model::ImportPayload {
                        display_name: Some("Fictional".into()),
                        name: crate::persons::model::PersonName::default(),
                        points: vec![],
                    }),
                    removed: false,
                    errors: vec![],
                },
                etag: Some("fictional-etag".into()),
                uid: Some("fictional-uid".into()),
            }],
            seen_record_keys: vec!["one".into()],
            progress: PageProgress::Complete {
                checkpoint: Some("original-checkpoint".into()),
            },
        },
    )
    .await
    .unwrap();
    let batches = sync::finalize_sync(&pool, &run.id).await.unwrap();
    let mut responses = discovery(principal);
    responses[2] = (207, "<d:multistatus xmlns:d=\"DAV:\"/>".into());
    fake.replies.lock().unwrap().extend(responses);
    assert!(matches!(
        runtime.start_sync(&pool, &id).await,
        Err(ProviderError::Invalid)
    ));
    assert_eq!(
        sync::checkpoint(&pool, &id, book).await.unwrap().as_deref(),
        Some("original-checkpoint")
    );
    let (active,runs):(i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM provider_records WHERE account_id=?1 AND active=1),(SELECT count(*) FROM provider_sync_runs WHERE account_id=?1)").bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!((active, runs), (1, 1));
    let latest:String=sqlx::query_scalar("SELECT latest_run_id FROM provider_collection_states WHERE account_id=?1 AND collection_key=?2").bind(&id).bind(book).fetch_one(&pool).await.unwrap();
    assert_eq!(latest, run.id);
    assert_eq!(batches.len(), 1);
}
