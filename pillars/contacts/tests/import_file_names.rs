//! Operational file parsing must expose only explicit structured parts as complete-name evidence.

use contacts::imports::file::parse_stage_input;
use contacts::imports::parser::{FileEncoding, FileFormat};
use contacts::imports::review;
use contacts::imports::review_model::{ProposalReason, ReviewClassification, ReviewQuery};
use contacts::imports::service;
use contacts::persons::model::{NameCompleteness, PersonName};
use contacts::persons::repo as persons;
use contacts::sources::model::SourceAccountInput;
use sqlx::SqlitePool;

async fn setup(complete_profile: bool) -> (SqlitePool, String, String) {
    let pool = contacts::db::connect("sqlite::memory:").await.unwrap();
    let account = contacts::sources::repo::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "file".into(),
            account_key: "name-evidence".into(),
            label: None,
        },
    )
    .await
    .unwrap();
    let id = persons::create_person(&mut pool.acquire().await.unwrap(), "Rosane Menegotto")
        .await
        .unwrap();
    if complete_profile {
        persons::put_profile(
            &pool,
            &id,
            PersonName {
                given_name: Some("Rosane".into()),
                family_name: Some("Menegotto".into()),
                completeness: NameCompleteness::Complete,
                ..PersonName::default()
            },
        )
        .await
        .unwrap();
    }
    (pool, account.id, id)
}

async fn stage_and_review(
    pool: &SqlitePool,
    account: &str,
    bytes: &[u8],
    format: FileFormat,
) -> contacts::imports::review_model::ReviewRow {
    let input = parse_stage_input(
        account.into(),
        "contacts".into(),
        bytes,
        format,
        FileEncoding::Utf8,
    )
    .unwrap();
    let batch = service::stage(pool, &input).await.unwrap();
    assert!(batch.rows[0].errors.is_empty());
    let page = review::get(pool, &batch.id, &ReviewQuery::default())
        .await
        .unwrap();
    page.rows.into_iter().next().unwrap()
}

#[tokio::test]
async fn parsed_csv_and_vcard_structured_names_match_a_unique_complete_profile() {
    let (pool, account, existing) = setup(true).await;
    let files: [(FileFormat, &[u8]); 2] = [
        (
            FileFormat::GoogleCsv,
            b"Name,Given Name,Family Name\nRosane Menegotto,Rosane,Menegotto\n",
        ),
        (
            FileFormat::Vcard,
            b"BEGIN:VCARD\nVERSION:4.0\nFN:Rosane Menegotto\nN:Menegotto;Rosane;;;\nEND:VCARD\n",
        ),
    ];
    for (format, bytes) in files {
        let row = stage_and_review(&pool, &account, bytes, format).await;
        let name = &row.incoming.as_ref().unwrap().name;
        assert_eq!(name.completeness, NameCompleteness::Complete);
        assert_eq!(name.given_name.as_deref(), Some("Rosane"));
        assert_eq!(name.family_name.as_deref(), Some("Menegotto"));
        assert_eq!(row.classification, ReviewClassification::Automatic);
        assert_eq!(row.reason, ProposalReason::CompleteName);
        assert_eq!(row.candidate_ids().collect::<Vec<_>>(), [existing.as_str()]);
    }
    let people: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(people, 1);
}

#[tokio::test]
async fn display_only_and_given_only_files_never_become_complete_name_auto_matches() {
    let (pool, account, existing) = setup(true).await;
    let files: [(FileFormat, &[u8]); 3] = [
        (FileFormat::GoogleCsv, b"Name\nRosane Menegotto\n"),
        (
            FileFormat::GoogleCsv,
            b"Name,Given Name\nRosane Menegotto,Rosane\n",
        ),
        (
            FileFormat::Vcard,
            b"BEGIN:VCARD\nVERSION:4.0\nFN:Rosane Menegotto\nEND:VCARD\n",
        ),
    ];
    for (format, bytes) in files {
        let row = stage_and_review(&pool, &account, bytes, format).await;
        assert_eq!(
            row.incoming.as_ref().unwrap().name.completeness,
            NameCompleteness::Unknown
        );
        assert_eq!(row.classification, ReviewClassification::Review);
        assert_eq!(row.reason, ProposalReason::IncompleteName);
        assert_eq!(row.candidate_ids().collect::<Vec<_>>(), [existing.as_str()]);
    }
    let row = stage_and_review(
        &pool,
        &account,
        b"Name,Given Name\nRosane,Rosane\n",
        FileFormat::GoogleCsv,
    )
    .await;
    assert_eq!(
        row.incoming.as_ref().unwrap().name.completeness,
        NameCompleteness::Unknown
    );
    assert_eq!(row.classification, ReviewClassification::New);
    assert_eq!(row.candidate_total, 0);
}

#[tokio::test]
async fn structured_file_names_keep_legacy_display_only_people_in_manual_review() {
    let (pool, account, existing) = setup(false).await;
    let row = stage_and_review(
        &pool,
        &account,
        b"Name,Given Name,Family Name\nRosane Menegotto,Rosane,Menegotto\n",
        FileFormat::GoogleCsv,
    )
    .await;
    assert_eq!(
        row.incoming.as_ref().unwrap().name.completeness,
        NameCompleteness::Complete
    );
    assert_eq!(row.classification, ReviewClassification::Review);
    assert_eq!(row.reason, ProposalReason::IncompleteName);
    assert_eq!(row.candidate_ids().collect::<Vec<_>>(), [existing.as_str()]);
}

#[test]
fn parsed_structured_name_parts_are_preserved_without_reconstructing_display_text() {
    let input = parse_stage_input("account".into(), "contacts".into(), b"BEGIN:VCARD\nVERSION:4.0\nFN:Original display text\nN:Menegotto;Rosane;Maria;Dr.;Jr.\nEND:VCARD\n", FileFormat::Vcard, FileEncoding::Utf8).unwrap();
    let payload = input.rows[0].payload.as_ref().unwrap();
    assert_eq!(
        payload.display_name.as_deref(),
        Some("Original display text")
    );
    assert_eq!(payload.name.completeness, NameCompleteness::Complete);
    assert_eq!(payload.name.given_name.as_deref(), Some("Rosane"));
    assert_eq!(payload.name.additional_names.as_deref(), Some("Maria"));
    assert_eq!(payload.name.family_name.as_deref(), Some("Menegotto"));
    assert_eq!(payload.name.name_prefix.as_deref(), Some("Dr."));
    assert_eq!(payload.name.name_suffix.as_deref(), Some("Jr."));
}
