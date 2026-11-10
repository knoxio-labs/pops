//! The additive method kind rebuild preserves live preferences, indexes and owner/revision guards.

use contacts::{
    db,
    entities::name_identity::{unicode_identity_collate, UNICODE_IDENTITY_COLLATION},
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;

#[tokio::test]
async fn other_kind_migration_preserves_points_references_and_guards_with_foreign_keys_enabled() {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true)
        .collation(UNICODE_IDENTITY_COLLATION, unicode_identity_collate);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    for migration in db::MIGRATOR
        .iter()
        .filter(|migration| migration.version < 20)
    {
        let mut tx = pool.begin().await.unwrap();
        sqlx::raw_sql(migration.sql.clone())
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();
    }
    sqlx::raw_sql(r#"INSERT INTO entities(id,name,type,last_edited_time) VALUES('person','Person','person','original'),('company','Company','company','original');
        INSERT INTO source_accounts(id,provider,account_key,created_at) VALUES('account','test','test','original');
        INSERT INTO source_records(id,account_id,collection_key,record_key,entity_id,last_seen_at) VALUES('source','account','book','person','person','original');
        INSERT INTO source_record_history(id,source_record_id,observed_at,observation) VALUES('history','source','original','{"displayName":" Source name "}');
        INSERT INTO contact_points(id,entity_id,kind,value,label,source_record_id,preferred,created_at) VALUES('original','person','email',' Original@Example.test ',' Original label ','source',1,'original');
        INSERT INTO merge_selections(canonical_id,field,point_id) VALUES('person','point:email','original');
        INSERT INTO merge_selections(canonical_id,field,source_history_id) VALUES('person','name','history');"#).execute(&pool).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::raw_sql(include_str!("../migrations/0020_other_contact_points.sql"))
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let selected:(String,String,String,bool)=sqlx::query_as("SELECT p.id,p.value,p.label,p.preferred FROM contact_points p JOIN merge_selections s ON s.point_id=p.id WHERE s.canonical_id='person'").fetch_one(&pool).await.unwrap();
    assert_eq!(
        selected,
        (
            "original".into(),
            " Original@Example.test ".into(),
            " Original label ".into(),
            true
        )
    );
    let retained:(String,String,String)=sqlx::query_as("SELECT p.source_record_id,h.observation,s.source_history_id FROM contact_points p JOIN source_record_history h ON h.source_record_id=p.source_record_id JOIN merge_selections s ON s.source_history_id=h.id WHERE p.id='original'").fetch_one(&pool).await.unwrap();
    assert_eq!(
        retained,
        (
            "source".into(),
            r#"{"displayName":" Source name "}"#.into(),
            "history".into()
        )
    );
    let chosen: String =
        sqlx::query_scalar("SELECT name FROM entity_identity_lookup WHERE id='person'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(chosen, " Source name ");
    let enabled: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(enabled, 1);
    assert!(sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await
        .unwrap()
        .is_empty());
    let before: i64 =
        sqlx::query_scalar("SELECT revision FROM contact_directory_revision WHERE singleton=1")
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("INSERT INTO contact_points(id,entity_id,kind,value,created_at) VALUES('other','company','other','opaque','now')").execute(&pool).await.unwrap();
    let after: i64 =
        sqlx::query_scalar("SELECT revision FROM contact_directory_revision WHERE singleton=1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(after > before);
    assert!(sqlx::query("INSERT INTO contact_points(id,entity_id,kind,value,preferred,created_at) VALUES('duplicate','person','email','second',1,'now')").execute(&pool).await.is_err());
    assert!(sqlx::query("INSERT INTO contact_points(id,entity_id,kind,value,created_at) VALUES('orphan','missing','other','opaque','now')").execute(&pool).await.is_err());
    assert!(sqlx::query("INSERT INTO contact_points(id,entity_id,kind,value,source_record_id,created_at) VALUES('bad-source','company','other','opaque','missing','now')").execute(&pool).await.is_err());
    sqlx::query("DELETE FROM contact_points WHERE id='original'")
        .execute(&pool)
        .await
        .unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM merge_selections WHERE point_id IS NOT NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
}
