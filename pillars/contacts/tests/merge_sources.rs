use contacts::{
    entities::{model::AssetIdPatch, repo as entities},
    merges::{
        decisions,
        model::{FieldSelection, MergeBody, MergeField, SeparateBody, SourceMergeField, UndoBody},
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
    let retained = persons::list_points(&pool, &a).await.expect("points");
    assert_eq!(retained.len(), 1);
    assert_eq!(retained[0].id, points[0].id);
    assert_eq!(retained[0].entity_id, b);
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
    body.selections.push(FieldSelection::Entity {
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
        FieldSelection::Entity {
            field: MergeField::Name,
            entity_id: b.clone(),
        },
        FieldSelection::Entity {
            field: MergeField::AvatarAssetId,
            entity_id: b.clone(),
        },
        FieldSelection::Entity {
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

#[tokio::test]
async fn imported_name_selections_bind_immutable_observations_and_preserve_provenance() {
    let pool = pool().await;
    let a = person(&pool, "A local").await;
    let b = person(&pool, "B local").await;
    let mut input = source(&pool, &b).await;
    input.display_name = Some("Original imported name".into());
    input.name = PersonName {
        given_name: Some("Rosane".into()),
        family_name: Some("Menegotto".into()),
        completeness: contacts::persons::model::NameCompleteness::Complete,
        ..Default::default()
    };
    let record = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("source");
    let mut body = merge_body(&pool, &a, &b).await;
    body.selections = vec![
        FieldSelection::SourceRecord {
            field: SourceMergeField::Name,
            source_record_id: record.id.clone(),
        },
        FieldSelection::SourceRecord {
            field: SourceMergeField::PersonProfile,
            source_record_id: record.id.clone(),
        },
    ];
    service::merge(&pool, body)
        .await
        .expect("selected imported fields");
    let profile = persons::get_profile(&pool, &a)
        .await
        .expect("profile")
        .expect("selected");
    assert_eq!(profile.name.family_name.as_deref(), Some("Menegotto"));
    assert_eq!(profile.source_record_id, Some(record.id.clone()));
    let observation = profile
        .source_observation_id
        .expect("immutable observation");
    let group = repo::group(&pool, &a).await.expect("group");
    assert_eq!(group.selections.len(), 2);
    assert_eq!(
        group
            .members
            .iter()
            .find(|member| member.entity.id == b)
            .expect("original member")
            .entity
            .name,
        "B local"
    );
    input.display_name = Some("Provider changed name".into());
    input.name.family_name = Some("Changed".into());
    sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("later source revision");
    assert_eq!(
        entities::get(&pool, &a)
            .await
            .expect("entity")
            .expect("present")
            .name,
        "Original imported name"
    );
    let retained = persons::get_profile(&pool, &a)
        .await
        .expect("profile")
        .expect("selected");
    assert_eq!(retained.name.family_name.as_deref(), Some("Menegotto"));
    assert_eq!(retained.source_observation_id, Some(observation));
    assert_eq!(
        sources::list_records(&pool, &a).await.expect("latest")[0]
            .family_name
            .as_deref(),
        Some("Changed")
    );
}

#[tokio::test]
async fn missing_outside_group_and_empty_source_field_references_are_atomic_errors() {
    let pool = pool().await;
    let a = person(&pool, "A").await;
    let b = person(&pool, "B").await;
    let c = person(&pool, "C excluded").await;
    let input = source(&pool, &c).await;
    let outside = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("outside source");
    for source_id in ["missing".to_owned(), outside.id] {
        let mut body = merge_body(&pool, &a, &b).await;
        body.selections.push(FieldSelection::SourceRecord {
            field: SourceMergeField::Name,
            source_record_id: source_id,
        });
        let before = revision(&pool).await;
        assert!(matches!(
            service::merge(&pool, body).await,
            Err(repo::MergeError::Invalid(_))
        ));
        assert_eq!(revision(&pool).await, before);
    }
    let input = source(&pool, &b).await;
    let mut input = SourceRecordInput {
        record_key: "empty-name".into(),
        display_name: None,
        ..input
    };
    let empty = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("empty source evidence");
    for field in [SourceMergeField::Name, SourceMergeField::PersonProfile] {
        let mut body = merge_body(&pool, &a, &b).await;
        body.selections.push(FieldSelection::SourceRecord {
            field,
            source_record_id: empty.id.clone(),
        });
        assert!(matches!(
            service::merge(&pool, body).await,
            Err(repo::MergeError::Invalid(_))
        ));
    }
    input.display_name = Some("Valid display".into());
    let source = sources::apply_record(&mut pool.acquire().await.expect("connection"), &input)
        .await
        .expect("source");
    let body = serde_json::json!({"canonicalId":a,"memberIds":[b],"expectedRevision":revision(&pool).await,
    "idempotencyKey":"unsupported","evidence":"invalid field","selections":[
        {"kind":"sourceRecord","field":"notes","sourceRecordId":source.id}
    ]});
    assert!(serde_json::from_value::<MergeBody>(body).is_err());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entity_redirects")
        .fetch_one(&pool)
        .await
        .expect("redirects");
    assert_eq!(count, 0);
}

#[tokio::test]
async fn reviewed_action_rolls_back_incoming_source_and_rejections_when_merge_fails() {
    let pool = pool().await;
    let selected = person(&pool, "Selected").await;
    let rejected = person(&pool, "Rejected").await;
    let mut input = source(&pool, &selected).await;
    let before = revision(&pool).await;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .expect("write reservation");
    let incoming = persons::create_person(&mut tx, "Incoming")
        .await
        .expect("incoming");
    input.entity_id = incoming.clone();
    sources::apply_record(&mut tx, &input)
        .await
        .expect("source");
    for (index, left) in [&incoming, &selected].into_iter().enumerate() {
        let expected_revision = repo::revision(&mut tx).await.expect("revision");
        decisions::decide_in_transaction(
            &mut tx,
            SeparateBody {
                left_id: left.clone(),
                right_id: rejected.clone(),
                keep_separate: true,
                expected_revision,
                idempotency_key: format!("exclude-{index}"),
                evidence: "Independent rejected candidate".into(),
            },
        )
        .await
        .expect("negative pair");
    }
    let expected_revision = repo::revision(&mut tx).await.expect("revision");
    let body = MergeBody {
        canonical_id: selected.clone(),
        member_ids: vec![incoming.clone()],
        expected_revision,
        idempotency_key: "composite".into(),
        evidence: "Selected subset".into(),
        selections: vec![],
        preferred_point_ids: vec!["missing".into()],
    };
    assert!(service::merge_in_transaction(&mut tx, body).await.is_err());
    tx.rollback().await.expect("whole action rollback");
    assert_eq!(revision(&pool).await, before);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM entities")
            .fetch_one(&pool)
            .await
            .expect("entities"),
        2
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM source_records")
            .fetch_one(&pool)
            .await
            .expect("sources"),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM identity_receipts")
            .fetch_one(&pool)
            .await
            .expect("receipts"),
        0
    );
    assert!(repo::separate_pairs(&pool)
        .await
        .expect("pairs")
        .data
        .is_empty());
    assert!(entities::get(&pool, &incoming)
        .await
        .expect("incoming")
        .is_none());
}

#[tokio::test]
async fn reviewed_action_merges_last_so_undo_preserves_source_and_independent_rejections() {
    let pool = pool().await;
    let selected = person(&pool, "Selected").await;
    let rejected = person(&pool, "Rejected").await;
    let mut input = source(&pool, &selected).await;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .expect("write reservation");
    let incoming = persons::create_person(&mut tx, "Incoming")
        .await
        .expect("incoming");
    input.entity_id = incoming.clone();
    sources::apply_record(&mut tx, &input)
        .await
        .expect("source");
    for (index, left) in [&incoming, &selected].into_iter().enumerate() {
        let expected_revision = repo::revision(&mut tx).await.expect("revision");
        decisions::decide_in_transaction(
            &mut tx,
            SeparateBody {
                left_id: left.clone(),
                right_id: rejected.clone(),
                keep_separate: true,
                expected_revision,
                idempotency_key: format!("exclude-{index}"),
                evidence: "Independent rejected candidate".into(),
            },
        )
        .await
        .expect("negative pair");
    }
    let expected_revision = repo::revision(&mut tx).await.expect("revision");
    let merged = service::merge_in_transaction(
        &mut tx,
        MergeBody {
            canonical_id: selected.clone(),
            member_ids: vec![incoming.clone()],
            expected_revision,
            idempotency_key: "composite".into(),
            evidence: "Selected subset".into(),
            selections: vec![],
            preferred_point_ids: vec![],
        },
    )
    .await
    .expect("merge last");
    assert_eq!(
        merged.revision,
        repo::revision(&mut tx).await.expect("revision")
    );
    tx.commit().await.expect("whole action commit");
    service::undo(
        &pool,
        &merged.operation_id,
        UndoBody {
            expected_revision: merged.revision,
            idempotency_key: "undo".into(),
        },
    )
    .await
    .expect("untouched merge can undo");
    assert_eq!(
        repo::group(&pool, &incoming)
            .await
            .expect("incoming")
            .canonical_id,
        incoming
    );
    assert_eq!(
        repo::separate_pairs(&pool)
            .await
            .expect("negative pairs")
            .data
            .len(),
        2
    );
    assert_eq!(
        sources::list_records(&pool, &incoming)
            .await
            .expect("source")
            .len(),
        1
    );
}

#[tokio::test]
async fn incoming_profile_selection_needs_no_merge_and_preserves_original_evidence() {
    let pool = pool().await;
    let incoming = person(&pool, "Incoming").await;
    let mut input = source(&pool, &incoming).await;
    input.name.given_name = Some("Incoming".into());
    input.name.family_name = Some("Person".into());
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .expect("transaction");
    let source = sources::apply_record(&mut tx, &input)
        .await
        .expect("source");
    let selected = service::select_in_transaction(
        &mut tx,
        &incoming,
        &[FieldSelection::SourceRecord {
            field: SourceMergeField::PersonProfile,
            source_record_id: source.id.clone(),
        }],
        &[],
    )
    .await
    .expect("default incoming profile");
    assert_eq!(selected.len(), 1);
    let profile = persons::get_profile_in_transaction(&mut tx, &incoming)
        .await
        .expect("projection")
        .expect("profile");
    assert_eq!(profile.name.family_name.as_deref(), Some("Person"));
    assert_eq!(
        profile.source_record_id.as_deref(),
        Some(source.id.as_str())
    );
    assert!(profile.source_observation_id.is_some());
    assert!(persons::get_stored_profile(&mut tx, &incoming)
        .await
        .expect("original")
        .is_none());
    assert_eq!(
        repo::members(&mut tx, &incoming).await.expect("members"),
        vec![incoming.clone()]
    );
    assert!(service::select_in_transaction(
        &mut tx,
        &incoming,
        &[FieldSelection::SourceRecord {
            field: SourceMergeField::PersonProfile,
            source_record_id: "missing".into()
        }],
        &[]
    )
    .await
    .is_err());
    tx.rollback().await.expect("rollback");
    assert!(sources::list_records(&pool, &incoming)
        .await
        .expect("rolled back source")
        .is_empty());
    assert!(persons::get_profile(&pool, &incoming)
        .await
        .expect("rolled back selection")
        .is_none());
}
