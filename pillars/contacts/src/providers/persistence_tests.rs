use super::credentials::{CredentialCipher, SecretBytes};
use super::human_auth::HumanIdentity;
use super::oauth_state::{begin_authorization, consume_authorization};
use super::store::*;
use crate::sources::model::{SourceAccount, SourceAccountInput};
use crate::sources::repo::create_or_get_account;
use sqlx::SqlitePool;

async fn setup(
    provider: &str,
) -> (
    SqlitePool,
    CredentialCipher,
    HumanIdentity,
    SourceAccount,
    AccountEpoch,
) {
    let pool = crate::db::connect("sqlite::memory:").await.unwrap();
    let operator = HumanIdentity::for_test("synthetic-operator");
    let account = new_account(&pool, provider, "first").await;
    let epoch = prepare_account(&pool, &operator, &account.id)
        .await
        .unwrap();
    (pool, CredentialCipher::for_test(), operator, account, epoch)
}

async fn new_account(pool: &SqlitePool, provider: &str, key: &str) -> SourceAccount {
    create_or_get_account(
        pool,
        &SourceAccountInput {
            provider: provider.to_string(),
            account_key: key.to_string(),
            label: None,
        },
    )
    .await
    .unwrap()
}

fn secret() -> SecretBytes {
    SecretBytes::new(vec![42; 25]).unwrap()
}

#[tokio::test]
async fn only_ciphertext_is_persisted_and_tampering_fails_closed() {
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    assert!(matches!(
        load_credential(&pool, &cipher, &account.id).await,
        Err(ProviderStoreError::StaleAccount)
    ));
    let installed = install_credential(&pool, &cipher, &operator, &account.id, epoch, &secret())
        .await
        .unwrap();
    assert!(installed.0 > epoch.0);
    let loaded = load_credential(&pool, &cipher, &account.id).await.unwrap();
    assert_eq!(loaded.secret.expose(), secret().expose());
    let mut ciphertext: Vec<u8> =
        sqlx::query_scalar("SELECT credential FROM provider_accounts WHERE account_id=?1")
            .bind(&account.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!ciphertext
        .windows(25)
        .any(|window| window == secret().expose()));
    ciphertext[15] ^= 1;
    sqlx::query("UPDATE provider_accounts SET credential=?1 WHERE account_id=?2")
        .bind(ciphertext)
        .bind(&account.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        load_credential(&pool, &cipher, &account.id).await,
        Err(ProviderStoreError::CredentialUnavailable)
    ));
}

#[tokio::test]
async fn disconnect_fences_workers_and_inflight_credential_installation() {
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    let installed = install_credential(&pool, &cipher, &operator, &account.id, epoch, &secret())
        .await
        .unwrap();
    disconnect_account(&pool, &operator, &account.id)
        .await
        .unwrap();
    let mut transaction = pool.begin().await.unwrap();
    assert_eq!(
        fence_account(&mut transaction, &account.id, installed).await,
        Err(ProviderStoreError::StaleAccount)
    );
    transaction.rollback().await.unwrap();
    assert!(matches!(
        install_credential(&pool, &cipher, &operator, &account.id, installed, &secret()).await,
        Err(ProviderStoreError::StaleAccount)
    ));
    let state: (bool, Option<Vec<u8>>) =
        sqlx::query_as("SELECT connected,credential FROM provider_accounts WHERE account_id=?1")
            .bind(&account.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!state.0);
    assert!(state.1.is_none());
}

#[tokio::test]
async fn state_is_bound_to_operator_expires_at_boundary_and_is_consumed_once() {
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    let attempt = begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000)
        .await
        .unwrap();
    let other = HumanIdentity::for_test("another-operator");
    assert!(matches!(
        consume_authorization(&pool, &cipher, &other, &attempt.state, 1001).await,
        Err(ProviderStoreError::InvalidState)
    ));
    let consumed = consume_authorization(&pool, &cipher, &operator, &attempt.state, 1599)
        .await
        .unwrap();
    assert_eq!(consumed.account_id, account.id);
    assert_eq!(consumed.epoch, epoch);
    assert_eq!(consumed.pkce_verifier.expose().len(), 43);
    use base64::Engine;
    assert_eq!(
        attempt.pkce_challenge,
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(ring::digest::digest(
            &ring::digest::SHA256,
            consumed.pkce_verifier.expose()
        ))
    );
    assert!(matches!(
        consume_authorization(&pool, &cipher, &operator, &attempt.state, 1599).await,
        Err(ProviderStoreError::InvalidState)
    ));
    let expired = begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000)
        .await
        .unwrap();
    assert!(matches!(
        consume_authorization(&pool, &cipher, &operator, &expired.state, 1600).await,
        Err(ProviderStoreError::InvalidState)
    ));
}

#[tokio::test]
async fn simultaneous_callbacks_have_one_winner_and_disconnect_erases_pending_attempts() {
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    let attempt = begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000)
        .await
        .unwrap();
    let (first, second) = tokio::join!(
        consume_authorization(&pool, &cipher, &operator, &attempt.state, 1001),
        consume_authorization(&pool, &cipher, &operator, &attempt.state, 1001)
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    let consumed = first.or(second).unwrap();
    let pending = begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000)
        .await
        .unwrap();
    disconnect_account(&pool, &operator, &account.id)
        .await
        .unwrap();
    assert!(matches!(
        consume_authorization(&pool, &cipher, &operator, &pending.state, 1001).await,
        Err(ProviderStoreError::InvalidState)
    ));
    assert!(matches!(
        install_credential(
            &pool,
            &cipher,
            &operator,
            &consumed.account_id,
            consumed.epoch,
            &secret()
        )
        .await,
        Err(ProviderStoreError::StaleAccount)
    ));
}

#[tokio::test]
async fn unsupported_accounts_and_non_google_authorization_are_refused() {
    let (pool, cipher, operator, account, epoch) = setup("icloud").await;
    assert!(matches!(
        begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000).await,
        Err(ProviderStoreError::StaleAccount)
    ));
    let unsupported = new_account(&pool, "file", "csv").await;
    assert_eq!(
        prepare_account(&pool, &operator, &unsupported.id).await,
        Err(ProviderStoreError::InvalidAccount)
    );
    assert_eq!(
        prepare_account(&pool, &operator, "missing").await,
        Err(ProviderStoreError::InvalidAccount)
    );
}

#[tokio::test]
async fn disconnect_preserves_canonical_person_local_points_and_other_sources() {
    use crate::persons::model::{ContactPointInput, ContactPointKind, PersonName};
    use crate::persons::repo::{create_person, insert_point, list_points};
    use crate::sources::model::SourceRecordInput;
    use crate::sources::repo::apply_record;
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    install_credential(&pool, &cipher, &operator, &account.id, epoch, &secret())
        .await
        .unwrap();
    let other = new_account(&pool, "icloud", "second").await;
    let mut transaction = pool.begin().await.unwrap();
    let person = create_person(&mut transaction, "Synthetic Person")
        .await
        .unwrap();
    let point = |value: &str| ContactPointInput {
        kind: ContactPointKind::Email,
        value: value.to_string(),
        label: None,
    };
    insert_point(
        &mut transaction,
        &person,
        &point("local@example.test"),
        None,
    )
    .await
    .unwrap();
    for source in [&account, &other] {
        apply_record(
            &mut transaction,
            &SourceRecordInput {
                account_id: source.id.clone(),
                collection_key: "default".to_string(),
                record_key: "record".to_string(),
                entity_id: person.clone(),
                display_name: None,
                name: PersonName::default(),
                points: vec![point(&format!("{}@example.test", source.provider))],
            },
        )
        .await
        .unwrap();
    }
    transaction.commit().await.unwrap();
    disconnect_account(&pool, &operator, &account.id)
        .await
        .unwrap();
    let points = list_points(&pool, &person).await.unwrap();
    assert_eq!(points.len(), 3);
    assert!(
        points
            .iter()
            .find(|point| point.value == "local@example.test")
            .unwrap()
            .active
    );
    assert!(
        points
            .iter()
            .find(|point| point.value == "icloud@example.test")
            .unwrap()
            .active
    );
    assert!(
        !points
            .iter()
            .find(|point| point.value == "google@example.test")
            .unwrap()
            .active
    );
    let people: i64 = sqlx::query_scalar("SELECT count(*) FROM entities WHERE id=?1")
        .bind(&person)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(people, 1);
}

#[tokio::test]
async fn abandoned_expired_states_and_fenced_attempts_are_purged() {
    let (pool, cipher, operator, account, epoch) = setup("google").await;
    begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1000)
        .await
        .unwrap();
    begin_authorization(&pool, &cipher, &operator, &account.id, epoch, 1600)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_oauth_states")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    install_credential(&pool, &cipher, &operator, &account.id, epoch, &secret())
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM provider_oauth_states")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
