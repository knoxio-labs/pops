use std::collections::BTreeMap;

use sqlx::SqliteConnection;

use crate::identity::{CandidateOrigin, IdentityCandidate, IdentityRecord, KeepSeparate};
use crate::persons::model::{ContactPoint, PersonName, PersonProfile};
use crate::sources::model::SourceRecord;

use super::super::review_model::{ReviewCandidate, ReviewPoint, ReviewSource};
use super::super::service::ImportError;
use super::records;

#[derive(Clone, sqlx::FromRow)]
pub(super) struct Account {
    pub id: String,
    pub provider: String,
    pub label: Option<String>,
}

pub(super) struct Directory {
    pub groups: BTreeMap<String, Group>,
    pub owners: BTreeMap<String, String>,
    pub sources: BTreeMap<String, SourceRecord>,
    source_keys: BTreeMap<(String, String, String), String>,
    pub accounts: BTreeMap<String, Account>,
    pub negatives: Vec<KeepSeparate>,
}

pub(super) struct Group {
    pub id: String,
    pub member_ids: Vec<String>,
    pub name: String,
    pub local_name: String,
    pub profile: Option<PersonProfile>,
    pub local_profile: Option<PersonProfile>,
    pub points: Vec<ContactPoint>,
    pub sources: Vec<SourceRecord>,
    pub records: Vec<IdentityRecord>,
}

impl Directory {
    pub async fn load(conn: &mut SqliteConnection) -> Result<Self, ImportError> {
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM entities WHERE type='person' AND id NOT IN (SELECT member_id FROM entity_redirects) ORDER BY id")
            .fetch_all(&mut *conn).await?;
        let accounts: Vec<Account> =
            sqlx::query_as("SELECT id,provider,label FROM source_accounts ORDER BY id")
                .fetch_all(&mut *conn)
                .await?;
        let accounts = accounts
            .into_iter()
            .map(|account| (account.id.clone(), account))
            .collect();
        let sources: Vec<SourceRecord> = sqlx::query_as("SELECT id,account_id,collection_key,record_key,entity_id,display_name,given_name,additional_names,family_name,name_prefix,name_suffix,name_completeness,active,last_seen_at,revision FROM source_records ORDER BY id")
            .fetch_all(&mut *conn).await?;
        let mut sources_by_owner: BTreeMap<String, Vec<SourceRecord>> = BTreeMap::new();
        for source in &sources {
            sources_by_owner
                .entry(source.entity_id.clone())
                .or_default()
                .push(source.clone());
        }
        let source_keys = sources
            .iter()
            .map(|source| {
                (
                    (
                        source.account_id.clone(),
                        source.collection_key.clone(),
                        source.record_key.clone(),
                    ),
                    source.id.clone(),
                )
            })
            .collect();
        let sources = sources
            .into_iter()
            .map(|source| (source.id.clone(), source))
            .collect();
        let pairs: Vec<(String, String)> =
            sqlx::query_as("SELECT left_id,right_id FROM keep_separate ORDER BY left_id,right_id")
                .fetch_all(&mut *conn)
                .await?;
        let negatives = pairs
            .into_iter()
            .map(|(left_id, right_id)| KeepSeparate { left_id, right_id })
            .collect();
        let mut groups = BTreeMap::new();
        let mut owners = BTreeMap::new();
        for id in ids {
            let group = crate::merges::repo::group_in_transaction(conn, &id)
                .await
                .map_err(|_| ImportError::Storage)?;
            let raw = crate::entities::repo::get_stored(conn, &id)
                .await?
                .ok_or(ImportError::Storage)?;
            let local_name = raw.name.clone();
            let local_profile = group
                .members
                .iter()
                .find(|member| member.entity.id == id)
                .and_then(|member| member.person_profile.clone());
            let entity = crate::merges::projection::entity(conn, raw).await?;
            let profile = crate::persons::repo::get_profile_in_transaction(conn, &id).await?;
            let points = crate::merges::projection::points_in_transaction(conn, &id).await?;
            let mut records = Vec::new();
            let mut group_sources = Vec::new();
            for member in group.members {
                owners.insert(member.entity.id.clone(), id.clone());
                records.push(records::local(
                    &member.entity.id,
                    &member.entity.name,
                    member.person_profile.as_ref().map(|profile| &profile.name),
                    &points,
                ));
                for source in sources_by_owner
                    .remove(&member.entity.id)
                    .unwrap_or_default()
                {
                    records.push(records::source(&source, &points)?);
                    group_sources.push(source);
                }
            }
            if let Some(profile) = &profile {
                records.push(records::local(
                    profile
                        .source_observation_id
                        .as_deref()
                        .unwrap_or(&profile.entity_id),
                    &entity.name,
                    Some(&profile.name),
                    &[],
                ));
            }
            groups.insert(
                id.clone(),
                Group {
                    id,
                    member_ids: group.member_ids,
                    name: entity.name,
                    local_name,
                    profile,
                    local_profile,
                    points,
                    sources: group_sources,
                    records,
                },
            );
        }
        Ok(Self {
            groups,
            owners,
            sources,
            source_keys,
            accounts,
            negatives,
        })
    }

    pub fn source_for(&self, account: &str, collection: &str, key: &str) -> Option<&SourceRecord> {
        self.source_keys
            .get(&(account.to_owned(), collection.to_owned(), key.to_owned()))
            .and_then(|id| self.sources.get(id))
    }

    pub fn source_evidence(&self, source: &SourceRecord) -> Result<ReviewSource, ImportError> {
        let account = self
            .accounts
            .get(&source.account_id)
            .ok_or(ImportError::Storage)?;
        Ok(ReviewSource {
            id: Some(source.id.clone()),
            account_id: account.id.clone(),
            owner_entity_id: Some(source.entity_id.clone()),
            provider: account.provider.clone(),
            label: account.label.clone(),
            display_name: source.display_name.clone(),
            name: records::source_name(source),
            active: source.active,
            revision: Some(source.revision),
        })
    }

    pub fn batch_source(&self, account_id: &str) -> Result<ReviewSource, ImportError> {
        let account = self.accounts.get(account_id).ok_or(ImportError::NotFound)?;
        Ok(ReviewSource {
            id: None,
            account_id: account.id.clone(),
            owner_entity_id: None,
            provider: account.provider.clone(),
            label: account.label.clone(),
            display_name: None,
            name: PersonName::default(),
            active: true,
            revision: None,
        })
    }

    pub fn separated(&self, left: &[String], right: &[String]) -> bool {
        self.negatives.iter().any(|pair| {
            (left.contains(&pair.left_id) && right.contains(&pair.right_id))
                || (left.contains(&pair.right_id) && right.contains(&pair.left_id))
        })
    }
}

impl Group {
    pub fn engine_candidate(&self) -> IdentityCandidate {
        IdentityCandidate {
            entity_id: self.id.clone(),
            origin: CandidateOrigin::Existing,
            member_ids: self.member_ids.clone(),
            records: self.records.clone(),
        }
    }

    pub fn evidence(&self, directory: &Directory) -> Result<ReviewCandidate, ImportError> {
        Ok(ReviewCandidate {
            entity_id: Some(self.id.clone()),
            row_id: None,
            member_ids: self.member_ids.clone(),
            name: self.name.clone(),
            local_name: self.local_name.clone(),
            person_profile: self.profile.clone(),
            local_person_profile: self.local_profile.clone(),
            points: self
                .points
                .iter()
                .map(|point| ReviewPoint {
                    id: Some(point.id.clone()),
                    owner_entity_id: Some(point.entity_id.clone()),
                    kind: point.kind.clone(),
                    value: point.value.clone(),
                    normalized_value: point.normalized_value.clone(),
                    label: point.label.clone(),
                    country_code: point.country_code.clone(),
                    source_record_id: point.source_record_id.clone(),
                    active: point.active,
                    preferred: point.preferred,
                })
                .collect(),
            sources: self
                .sources
                .iter()
                .map(|source| directory.source_evidence(source))
                .collect::<Result<_, _>>()?,
            reasons: Vec::new(),
            keep_separate: false,
        })
    }
}
