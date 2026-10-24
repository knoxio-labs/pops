//! Person foundation contracts exercised through migrated SQLite and the assembled router.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use contacts::{
    app::{build_router, AppState},
    db,
    persons::{
        model::{ContactPointInput, ContactPointKind, PersonName},
        repo as persons,
    },
    sources::{
        model::{SourceAccountInput, SourceRecordInput},
        repo as sources,
    },
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

async fn app() -> (axum::Router, sqlx::SqlitePool) {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    (
        build_router(AppState {
            pool: pool.clone(),
            version: "test".to_string(),
            service_account_scope_verifier: common::service_account_scope_verifier(),
        }),
        pool,
    )
}

async fn send(app: &axum::Router, method: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, value)
}

async fn create(app: &axum::Router, name: &str, ty: &str) -> String {
    let (status, body) = send(app, "POST", "/entities", json!({"name":name,"type":ty})).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn homonyms_coexist_with_merchants_and_type_transitions_check_effective_identity() {
    let (app, pool) = app().await;
    let merchant = create(&app, "São João", "company").await;
    let first = create(&app, "Sao Joao", "person").await;
    let second = create(&app, "SÃO JOÃO", "person").await;
    create(&app, "João", "person").await;
    create(&app, "João", "person").await;
    assert_ne!(first, second);
    assert_ne!(first, merchant);
    assert_eq!(
        send(
            &app,
            "POST",
            "/entities",
            json!({"name":"SAO JOAO","type":"bank"})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        send(
            &app,
            "PATCH",
            &format!("/entities/{first}"),
            json!({"type":"company"})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        send(
            &app,
            "PATCH",
            &format!("/entities/{merchant}"),
            json!({"name":"SÃO JOÃO","type":"person"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, body) = send(&app, "GET", "/entities?excludePersons=true", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["pagination"]["total"], 0);
    assert_eq!(
        send(
            &app,
            "PATCH",
            &format!("/entities/{first}"),
            json!({"type":"company"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, body) = send(
        &app,
        "POST",
        "/entities/lookup",
        json!({"excludePersons":true}),
    )
    .await;
    assert_eq!(body["entities"].as_array().unwrap().len(), 1);
    assert_eq!(body["entities"][0]["type"], "company");
    assert_eq!(body["entities"][0]["id"], first);
    assert_eq!(
        contacts::entities::repo::find_by_name(&pool, "Sao Joao")
            .await
            .unwrap()
            .unwrap()
            .id,
        first
    );
    let (_, body) = send(&app, "POST", "/entities/lookup", json!({})).await;
    assert_eq!(body["entities"].as_array().unwrap().len(), 5);
}

#[tokio::test]
async fn local_profiles_and_points_reject_wrong_types_and_cross_person_preferences() {
    let (app, pool) = app().await;
    let company = create(&app, "Business", "company").await;
    let person = create(&app, "Alex", "person").await;
    let other = create(&app, "Alex", "person").await;
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{company}/person"),
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        send(&app, "GET", "/entities/missing/person", Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{person}/person"),
            json!({"givenName":"Alex","completeness":"complete"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let profile = json!({"givenName":"Alex","familyName":"Smith","completeness":"complete"});
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{person}/person"),
            profile.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, body) = send(
        &app,
        "GET",
        &format!("/entities/{person}/person"),
        Value::Null,
    )
    .await;
    assert_eq!(
        body["data"]["name"],
        json!({"givenName":"Alex","additionalNames":null,"familyName":"Smith","namePrefix":null,"nameSuffix":null,"completeness":"complete"})
    );
    assert_eq!(
        send(
            &app,
            "POST",
            &format!("/entities/{person}/contact-points"),
            json!({"kind":"email","value":" "})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (status, point) = send(
        &app,
        "POST",
        &format!("/entities/{person}/contact-points"),
        json!({"kind":"email","value":"alex@example.test","label":"home"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(point["data"]["sourceRecordId"].is_null());
    let point_id = point["data"]["id"].as_str().unwrap();
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{other}/contact-points/{point_id}/preferred"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(
            &app,
            "PUT",
            &format!("/entities/{person}/contact-points/{point_id}/preferred"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(persons::list_points(&pool, &person).await.unwrap()[0].preferred);
    assert_eq!(
        send(
            &app,
            "PATCH",
            &format!("/entities/{person}"),
            json!({"type":"company"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert!(
        sqlx::query("UPDATE entities SET type='company' WHERE id=?1")
            .bind(&person)
            .execute(&pool)
            .await
            .is_err()
    );
}

fn point(value: &str) -> ContactPointInput {
    ContactPointInput {
        kind: ContactPointKind::Email,
        country_code: None,
        value: value.to_string(),
        label: Some("work".to_string()),
    }
}

#[tokio::test]
async fn source_refresh_and_deletion_keep_local_preferences_and_separate_namespaces() {
    let (app, pool) = app().await;
    let first = create(&app, "Alex", "person").await;
    let other = create(&app, "Alex", "person").await;
    let account = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "carddav".to_string(),
            account_key: "subject-1".to_string(),
            label: Some("old label".to_string()),
        },
    )
    .await
    .unwrap();
    let relabel = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "carddav".to_string(),
            account_key: "subject-1".to_string(),
            label: Some("new label".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(account.id, relabel.id);
    let account2 = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "google".to_string(),
            account_key: "subject-1".to_string(),
            label: None,
        },
    )
    .await
    .unwrap();
    assert_ne!(account.id, account2.id);
    persons::put_profile(
        &pool,
        &first,
        PersonName {
            given_name: Some("Local".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let mut tx = pool.begin().await.unwrap();
    let local = persons::insert_point(&mut tx, &first, &point("local@example.test"), None)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    persons::prefer_point(&pool, &first, &local.id)
        .await
        .unwrap();
    let mut input = SourceRecordInput {
        account_id: account.id.clone(),
        collection_key: "addressbook".to_string(),
        record_key: "contact-1".to_string(),
        entity_id: first.clone(),
        display_name: Some("Source Alex".to_string()),
        name: PersonName::default(),
        points: vec![point("old@example.test")],
    };
    let mut tx = pool.begin().await.unwrap();
    let initial = sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    input.points = vec![point("new@example.test")];
    let mut tx = pool.begin().await.unwrap();
    let refreshed = sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    assert_eq!(initial.id, refreshed.id);
    assert_eq!(refreshed.revision, initial.revision + 1);
    let points = persons::list_points(&pool, &first).await.unwrap();
    assert_eq!(points.len(), 3);
    assert!(points
        .iter()
        .any(|point| point.id == local.id && point.preferred && point.active));
    assert!(points
        .iter()
        .any(|point| point.value == "old@example.test" && !point.active));
    assert!(points
        .iter()
        .any(|point| point.value == "new@example.test" && point.active));
    assert_eq!(
        persons::get_profile(&pool, &first)
            .await
            .unwrap()
            .unwrap()
            .name
            .given_name
            .as_deref(),
        Some("Local")
    );
    let imported = points
        .iter()
        .find(|point| point.value == "new@example.test")
        .unwrap();
    persons::prefer_point(&pool, &first, &imported.id)
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    assert!(sources::deactivate_record(&mut tx, &initial.id)
        .await
        .unwrap());
    assert!(!sources::deactivate_record(&mut tx, "missing")
        .await
        .unwrap());
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &first).await.unwrap();
    assert!(points
        .iter()
        .any(|point| point.id == imported.id && point.preferred && !point.active));
    assert!(points
        .iter()
        .any(|point| point.id == local.id && point.active));
    let histories: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM source_record_history WHERE source_record_id=?1")
            .bind(&initial.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(histories, 2);
    input.entity_id = other.clone();
    let mut tx = pool.begin().await.unwrap();
    assert!(matches!(
        sources::apply_record(&mut tx, &input).await,
        Err(sources::SourceError::Conflict)
    ));
    tx.rollback().await.unwrap();
    input.collection_key = "other-addressbook".to_string();
    let mut tx = pool.begin().await.unwrap();
    let other_record = sources::apply_record(&mut tx, &input).await.unwrap();
    assert_ne!(initial.id, other_record.id);
    tx.commit().await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    assert!(persons::insert_point(
        &mut tx,
        &first,
        &point("shared@example.test"),
        Some(&other_record.id)
    )
    .await
    .is_err());
    tx.rollback().await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    let rollback_person = persons::create_person(&mut tx, "Rolled Back")
        .await
        .unwrap();
    tx.rollback().await.unwrap();
    assert!(contacts::entities::repo::get(&pool, &rollback_person)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn migration_keeps_existing_entity_ids_and_merchant_uniqueness() {
    use contacts::entities::name_identity::{unicode_identity_collate, UNICODE_IDENTITY_COLLATION};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;
    let options = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true)
        .collation(UNICODE_IDENTITY_COLLATION, unicode_identity_collate);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    for migration in [
        include_str!("../migrations/0001_init.sql"),
        include_str!("../migrations/0002_entities.sql"),
        include_str!("../migrations/0003_entities_name_ci_unique.sql"),
        include_str!("../migrations/0004_entities_avatar_poster_colour.sql"),
        include_str!("../migrations/0005_blobs.sql"),
        include_str!("../migrations/0006_entities_name_unicode_unique.sql"),
        include_str!("../migrations/0007_entity_addresses.sql"),
    ] {
        sqlx::raw_sql(migration).execute(&pool).await.unwrap();
    }
    let merchant_id = uuid::Uuid::new_v4().to_string();
    let person_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO entities(id,name,type,aliases,notion_id,last_edited_time) VALUES(?1,'São João','company','Acme','original-notion','original-time'),(?2,'Alex','person',NULL,NULL,'original-time')").bind(&merchant_id).bind(&person_id).execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../migrations/0008_person_name_identity.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../migrations/0009_person_sources.sql"))
        .execute(&pool)
        .await
        .unwrap();
    let row: (String, String, String, String, String) =
        sqlx::query_as("SELECT id,name,type,aliases,notion_id FROM entities WHERE id=?1")
            .bind(&merchant_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        row,
        (
            merchant_id,
            "São João".to_string(),
            "company".to_string(),
            "Acme".to_string(),
            "original-notion".to_string()
        )
    );
    let mut tx = pool.begin().await.unwrap();
    let homonym = persons::create_person(&mut tx, "Alex").await.unwrap();
    assert_ne!(homonym, person_id);
    persons::create_person(&mut tx, "Sao Joao").await.unwrap();
    tx.commit().await.unwrap();
    assert!(sqlx::query(
        "INSERT INTO entities(id,name,type,last_edited_time) VALUES(?1,'Sao Joao','bank','now')"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .execute(&pool)
    .await
    .is_err());
}

#[tokio::test]
async fn national_phones_need_explicit_known_country_context() {
    let (app, pool) = app().await;
    let person = create(&app, "Alex", "person").await;
    let path = format!("/entities/{person}/contact-points");
    let (_, without) = send(
        &app,
        "POST",
        &path,
        json!({"kind":"phone","value":"0412 345 678"}),
    )
    .await;
    assert!(without["data"]["normalizedValue"].is_null());
    let (status, explicit) = send(
        &app,
        "POST",
        &path,
        json!({"kind":"phone","value":"0412 345 678","countryCode":"AU","label":"mobile"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(explicit["data"]["normalizedValue"], "+61412345678");
    assert_eq!(explicit["data"]["value"], "0412 345 678");
    assert_eq!(explicit["data"]["countryCode"], "AU");
    for body in [
        json!({"kind":"phone","value":"0412 345 678","countryCode":"not-a-region"}),
        json!({"kind":"phone","value":"0412 345 678","countryCode":"ZZ"}),
        json!({"kind":"email","value":"a@example.test","countryCode":"AU"}),
    ] {
        assert_eq!(
            send(&app, "POST", &path, body).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    let points = persons::list_points(&pool, &person).await.unwrap();
    assert_eq!(points.len(), 2);
    assert!(points
        .iter()
        .any(|point| point.country_code.as_deref() == Some("AU")
            && point.normalized_value.as_deref() == Some("+61412345678")));
}

#[tokio::test]
async fn source_metadata_refresh_reuses_surviving_preferred_observations() {
    let (app, pool) = app().await;
    let person = create(&app, "Alex", "person").await;
    let account = sources::create_or_get_account(
        &pool,
        &SourceAccountInput {
            provider: "google".to_string(),
            account_key: "subject".to_string(),
            label: None,
        },
    )
    .await
    .unwrap();
    let mut input = SourceRecordInput {
        account_id: account.id,
        collection_key: "contacts".to_string(),
        record_key: "record-1".to_string(),
        entity_id: person.clone(),
        display_name: Some("Alex".to_string()),
        name: PersonName::default(),
        points: vec![point("alex@example.test")],
    };
    let mut tx = pool.begin().await.unwrap();
    let source = sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    let preferred = persons::list_points(&pool, &person)
        .await
        .unwrap()
        .remove(0);
    persons::prefer_point(&pool, &person, &preferred.id)
        .await
        .unwrap();
    input.display_name = Some("Alex Smith".to_string());
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &person).await.unwrap();
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].id, preferred.id);
    assert!(points[0].active && points[0].preferred);
    let mut tx = pool.begin().await.unwrap();
    sources::deactivate_record(&mut tx, &source.id)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &person).await.unwrap();
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].id, preferred.id);
    assert!(points[0].active && points[0].preferred);
    input.points.clear();
    let mut tx = pool.begin().await.unwrap();
    sources::apply_record(&mut tx, &input).await.unwrap();
    tx.commit().await.unwrap();
    let points = persons::list_points(&pool, &person).await.unwrap();
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].id, preferred.id);
    assert!(!points[0].active);
    assert!(points[0].preferred);
}
