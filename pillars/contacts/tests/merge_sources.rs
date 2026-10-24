use contacts::{
    entities::{model::AssetIdPatch, repo as entities},
    merges::{
        decisions,
        model::{FieldSelection, MergeBody, MergeField, SeparateBody, UndoBody},
        repo, service,
    },
    persons::{
        model::{ContactPointInput, ContactPointKind, PersonName},
        repo as persons,
    },
    sources::{
        model::{SourceAccountInput, SourceRecordInput},
        repo as sources,
    },
};
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    contacts::db::connect("sqlite::memory:")
        .await
        .expect("database")
}

async fn person(pool: &SqlitePool, name: &str) -> String {
    persons::create_person(&mut pool.acquire().await.expect("connection"), name)
        .await
        .expect("person")
}

async fn revision(pool: &SqlitePool) -> i64 {
    repo::revision(&mut pool.acquire().await.expect("connection"))
        .await
        .expect("revision")
}

async fn merge_body(pool: &SqlitePool, a: &str, b: &str) -> MergeBody {
    MergeBody {
        canonical_id: a.into(),
        member_ids: vec![b.into()],
        expected_revision: revision(pool).await,
        idempotency_key: "merge".into(),
        evidence: "Explicit pair decision".into(),
        selections: vec![],
        preferred_point_ids: vec![],
    }
}

async fn source(pool: &SqlitePool, owner: &str) -> SourceRecordInput {
    let account = sources::create_or_get_account(
        pool,
        &SourceAccountInput {
            provider: "test".into(),
            account_key: "owner".into(),
            label: None,
        },
    )
    .await
    .expect("account");
    SourceRecordInput {
        account_id: account.id,
        collection_key: "book".into(),
        record_key: "stable".into(),
        entity_id: owner.into(),
        display_name: Some("Source name".into()),
        name: PersonName::default(),
        points: vec![ContactPointInput {
            kind: ContactPointKind::Email,
            value: "person@example.test".into(),
            label: None,
            country_code: None,
        }],
    }
}

#[tokio::test]
async fn identical_reimport_preserves_undo_but_changed_observation_fences_it() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let mut input = source(&pool, &b).await;
    let original = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("source");
    let merged = service::merge(&pool, merge_body(&pool, &a, &b).await)
        .await
        .expect("merge");
    let replay = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("replay");
    assert_eq!(replay.id, original.id);
    assert_eq!(revision(&pool).await, merged.revision);
    let source_rows = sources::list_records(&pool, &a).await.expect("projection");
    assert_eq!(source_rows[0].entity_id, b);
    let points = persons::list_points(&pool, &a).await.expect("points");
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].entity_id, b);
    input.display_name = Some("Changed source name".into());
    sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("changed source");
    assert!(matches!(
        service::undo(
            &pool,
            &merged.operation_id,
            UndoBody {
                expected_revision: revision(&pool).await,
                idempotency_key: "undo".into()
            }
        )
        .await,
        Err(repo::MergeError::Conflict { .. })
    ));
    assert_eq!(repo::group(&pool, &b).await.expect("group").canonical_id, a);
    assert_eq!(
        persons::list_points(&pool, &a).await.expect("points").len(),
        2
    );
}

#[tokio::test]
async fn retained_assets_and_explicit_preferences_restore_on_undo() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let blob = contacts::blobs::repo::create(&pool, "image/png", b"retained")
        .await
        .expect("blob");
    entities::set_asset_ids(
        &pool,
        &b,
        AssetIdPatch {
            avatar_asset_id: Some(Some(blob.clone())),
            poster_asset_id: None,
        },
    )
    .await
    .expect("asset");
    let mut body = merge_body(&pool, &a, &b).await;
    body.selections.push(FieldSelection {
        field: MergeField::AvatarAssetId,
        entity_id: b.clone(),
    });
    let merged = service::merge(&pool, body).await.expect("merge");
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("entity")
            .expect("present")
            .avatar_asset_id,
        Some(blob.clone())
    );
    service::undo(
        &pool,
        &merged.operation_id,
        UndoBody {
            expected_revision: merged.revision,
            idempotency_key: "undo".into(),
        },
    )
    .await
    .expect("undo");
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("a")
            .expect("present")
            .avatar_asset_id,
        None
    );
    assert_eq!(
        entities::get(&pool, &b)
            .await
            .expect("b")
            .expect("present")
            .avatar_asset_id,
        Some(blob.clone())
    );
    assert!(contacts::blobs::repo::get(&pool, &blob)
        .await
        .expect("blob")
        .is_some());
}

#[tokio::test]
async fn candidate_rejection_survives_source_replay_without_touching_pending_candidate() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C").await;
    let d = person(&pool, "D pending").await;
    let input = source(&pool, &b).await;
    let original = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("source");
    service::merge(&pool, merge_body(&pool, &a, &b).await)
        .await
        .expect("selected pair");
    decisions::decide(
        &pool,
        SeparateBody {
            left_id: a.clone(),
            right_id: c.clone(),
            keep_separate: true,
            expected_revision: revision(&pool).await,
            idempotency_key: "not-c".into(),
            evidence: "Not this candidate".into(),
        },
    )
    .await
    .expect("rejection");
    let before = revision(&pool).await;
    let replay = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("replay");
    assert_eq!(replay.id, original.id);
    assert_eq!(revision(&pool).await, before);
    assert_eq!(
        repo::separate_pairs(&pool)
            .await
            .expect("decisions")
            .data
            .len(),
        2
    );
    let mut body = merge_body(&pool, &a, &c).await;
    body.idempotency_key = "reimport-attempt".into();
    assert!(matches!(
        service::merge(&pool, body).await,
        Err(repo::MergeError::Conflict { .. })
    ));
    assert_eq!(
        repo::group(&pool, &d).await.expect("pending").member_ids,
        vec![d]
    );
    assert_eq!(
        sources::list_records(&pool, &a).await.expect("source")[0].entity_id,
        b
    );
}

#[tokio::test]
async fn retired_local_writes_fail_while_original_source_refresh_remains_supported() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    service::merge(&pool, merge_body(&pool, &a, &b).await)
        .await
        .expect("merge");
    assert!(matches!(
        persons::put_profile(&pool, &b, PersonName::default()).await,
        Err(persons::PersonError::Retired(_))
    ));
    let input = ContactPointInput {
        kind: ContactPointKind::Phone,
        value: "+61412345678".into(),
        label: None,
        country_code: None,
    };
    assert!(matches!(
        persons::insert_point(
            &mut pool.acquire().await.expect("connection"),
            &b,
            &input,
            None
        )
        .await,
        Err(persons::PersonError::Retired(_))
    ));
    let epoch = revision(&pool).await;
    assert!(
        sqlx::query("UPDATE entities SET notes='forbidden' WHERE id=?1")
            .bind(&b)
            .execute(&pool)
            .await
            .is_err()
    );
    assert_eq!(revision(&pool).await, epoch);
}

#[tokio::test]
async fn manual_canonical_edits_replace_selections_and_preserve_other_member_assets() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let blob = contacts::blobs::repo::create(&pool, "image/png", b"original")
        .await
        .expect("blob");
    entities::set_asset_ids(
        &pool,
        &b,
        AssetIdPatch {
            avatar_asset_id: Some(Some(blob.clone())),
            poster_asset_id: None,
        },
    )
    .await
    .expect("asset");
    persons::put_profile(
        &pool,
        &b,
        PersonName {
            given_name: Some("Original".into()),
            ..PersonName::default()
        },
    )
    .await
    .expect("original profile");
    let mut body = merge_body(&pool, &a, &b).await;
    body.selections = vec![
        FieldSelection {
            field: MergeField::Name,
            entity_id: b.clone(),
        },
        FieldSelection {
            field: MergeField::AvatarAssetId,
            entity_id: b.clone(),
        },
        FieldSelection {
            field: MergeField::PersonProfile,
            entity_id: b.clone(),
        },
    ];
    service::merge(&pool, body).await.expect("merge");
    entities::update(
        &pool,
        &a,
        contacts::entities::model::UpdateEntityBody {
            name: Some("Local".into()),
            ..Default::default()
        },
    )
    .await
    .expect("edit");
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("get")
            .expect("entity")
            .name,
        "Local"
    );
    let name: String = sqlx::query_scalar("SELECT name FROM entities WHERE id=?1")
        .bind(&b)
        .fetch_one(&pool)
        .await
        .expect("original");
    assert_eq!(name, "B");
    persons::put_profile(
        &pool,
        &a,
        PersonName {
            given_name: Some("Local".into()),
            ..PersonName::default()
        },
    )
    .await
    .expect("local profile");
    assert_eq!(
        persons::get_profile(&pool, &a)
            .await
            .expect("profile")
            .expect("present")
            .entity_id,
        a
    );
    entities::set_asset_ids(
        &pool,
        &a,
        AssetIdPatch {
            avatar_asset_id: Some(None),
            poster_asset_id: None,
        },
    )
    .await
    .expect("remove projected asset");
    contacts::blobs::repo::delete(&pool, &blob)
        .await
        .expect("safe cleanup");
    assert!(contacts::blobs::repo::get(&pool, &blob)
        .await
        .expect("blob")
        .is_some());
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("entity")
            .expect("present")
            .avatar_asset_id,
        None
    );
}

#[tokio::test]
async fn new_source_links_cannot_target_retired_ids() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    service::merge(&pool, merge_body(&pool, &a, &b).await)
        .await
        .expect("merge");
    let mut input = source(&pool, &b).await;
    assert!(matches!(
        sources::apply_record(&mut pool.acquire().await.expect("connection"), &input).await,
        Err(sources::SourceError::Conflict)
    ));
    input.entity_id = a.clone();
    let stored = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("canonical explicit link");
    assert_eq!(stored.entity_id, a);
}
