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
    let (status, untouched) = send(
        &app,
        "GET",
        &format!("/entities/{person}/person"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(untouched["data"].is_null());
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
    let (status, listed) = send(
        &app,
        "GET",
        &format!("/entities/{person}/contact-points"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);
    assert_eq!(listed["data"][0]["id"], point_id);
    assert_eq!(listed["data"][0]["preferred"], true);
    assert!(listed["data"][0]["sourceRecordId"].is_null());

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
    let mut tx = pool.begin().await.unwrap();
    let unchanged = sources::apply_record(&mut tx, &input).await.unwrap();
    assert_eq!(unchanged.revision, initial.revision);
    assert_eq!(unchanged.last_seen_at, initial.last_seen_at);
    tx.commit().await.unwrap();
    assert_eq!(persons::list_points(&pool, &first).await.unwrap().len(), 2);
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
    assert!(points.iter().all(|point| point.normalized_value.is_some()));
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
async fn malformed_person_and_source_metadata_use_safe_error_envelopes() {
    let (app, pool) = app().await;
    let person = create(&app, "Alex", "person").await;
    for (path, body) in [
        (
            format!("/entities/{person}/person"),
            json!({"completeness":"guessed"}),
        ),
        (
            format!("/entities/{person}/contact-points"),
            json!({"kind":"unrecognized","value":"value"}),
        ),
        (
            "/sources/accounts".to_string(),
            json!({"provider":"google","accountKey":"subject","credential":"not accepted"}),
        ),
    ] {
        let method = if path.ends_with("/person") {
            "PUT"
        } else {
            "POST"
        };
        let (status, body) = send(&app, method, &path, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["code"], "contacts.request.invalid");
        assert!(body["requestId"].is_string());
        assert_eq!(body["retryable"], false);
    }
    assert!(sources::list_accounts(&pool).await.unwrap().is_empty());
    assert!(persons::list_points(&pool, &person)
        .await
        .unwrap()
        .is_empty());
    let (status, _) = send(
        &app,
        "POST",
        "/sources/accounts",
        json!({"provider":" ","accountKey":"subject"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let mut tx = pool.begin().await.unwrap();
    let input = SourceRecordInput {
        account_id: "missing".to_string(),
        collection_key: "addressbook".to_string(),
        record_key: "record".to_string(),
        entity_id: person,
        name: PersonName::default(),
        display_name: None,
        points: Vec::new(),
    };
    assert!(matches!(
        sources::apply_record(&mut tx, &input).await,
        Err(sources::SourceError::NotFound)
    ));
    tx.rollback().await.unwrap();
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
async fn source_http_routes_preserve_account_labels_and_show_inactive_person_links() {
    let (app, pool) = app().await;
    let person = create(&app, "Alex", "person").await;
    let company = create(&app, "Business", "company").await;
    let input = json!({"provider":"google","accountKey":"stable-subject","label":"Personal"});
    let (status, registered) = send(&app, "POST", "/sources/accounts", input).await;
    assert_eq!(status, StatusCode::OK);
    let account_id = registered["data"]["id"].as_str().unwrap().to_string();
    assert_eq!(registered["data"]["provider"], "google");
    let (status, reused) = send(
        &app,
        "POST",
        "/sources/accounts",
        json!({"provider":"google","accountKey":"stable-subject"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reused["data"]["id"], account_id);
    assert_eq!(reused["data"]["label"], "Personal");
    let (status, accounts) = send(&app, "GET", "/sources/accounts", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(accounts["data"].as_array().unwrap().len(), 1);
    assert_eq!(accounts["data"][0]["accountKey"], "stable-subject");
    assert_eq!(accounts["data"][0]["label"], "Personal");
    let path = format!("/entities/{person}/sources");
    assert_eq!(
        send(&app, "GET", &path, Value::Null).await.1["data"],
        json!([])
    );
    let mut tx = pool.begin().await.unwrap();
    let record = sources::apply_record(
        &mut tx,
        &SourceRecordInput {
            account_id,
            collection_key: "contacts".to_string(),
            record_key: "record-1".to_string(),
            entity_id: person.clone(),
            display_name: Some("Source Alex".to_string()),
            name: PersonName::default(),
            points: vec![point("alex@example.test")],
        },
    )
    .await
    .unwrap();
    sources::deactivate_record(&mut tx, &record.id)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let (status, records) = send(&app, "GET", &path, Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(records["data"].as_array().unwrap().len(), 1);
    assert_eq!(records["data"][0]["id"], record.id);
    assert_eq!(records["data"][0]["entityId"], person);
    assert_eq!(records["data"][0]["active"], false);
    assert_eq!(records["data"][0]["revision"], 2);
    assert_eq!(
        send(
            &app,
            "GET",
            &format!("/entities/{company}/sources"),
            Value::Null
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        send(&app, "GET", "/entities/missing/sources", Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[test]
fn observation_validation_checks_byte_and_collection_boundaries() {
    let mut value = point(&"x".repeat(4096));
    assert!(persons::validate_point(&value).is_ok());
    value.value.push('x');
    assert!(persons::validate_point(&value).is_err());
    value.value = "valid".to_string();
    value.label = Some("x".repeat(256));
    assert!(persons::validate_point(&value).is_ok());
    value.label = Some("x".repeat(257));
    assert!(persons::validate_point(&value).is_err());
    let mut name = PersonName {
        given_name: Some("x".repeat(1024)),
        ..Default::default()
    };
    assert!(persons::validate_name(&name).is_ok());
    name.given_name = Some("x".repeat(1025));
    assert!(persons::validate_name(&name).is_err());
    let mut record = SourceRecordInput {
        account_id: "account".to_string(),
        collection_key: "x".repeat(1024),
        record_key: "record".to_string(),
        entity_id: "person".to_string(),
        display_name: None,
        name: PersonName::default(),
        points: vec![point("a@example.test"); 200],
    };
    assert!(sources::validate_record(&record).is_ok());
    record.points.push(point("a@example.test"));
    assert!(sources::validate_record(&record).is_err());
    record.points.clear();
    record.collection_key.push('x');
    assert!(sources::validate_record(&record).is_err());
    record.collection_key = " ".to_string();
    assert!(sources::validate_record(&record).is_err());
}
