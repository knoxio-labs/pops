use crate::identity::{CandidateOrigin, IdentityCandidate, IdentityRecord};

use super::super::model::{ImportBatch, ImportRow, RowProposal};
use super::super::review_state::ReviewRowState;
use super::super::service::ImportError;
use super::{directory::Directory, records};

pub(super) struct PreparedRow {
    pub row: ImportRow,
    pub state: Option<ReviewRowState>,
    pub owner_entity_id: Option<String>,
    pub entity_id: Option<String>,
    pub source_record_id: Option<String>,
    pub stale_source: bool,
    pub record: Option<IdentityRecord>,
    pub after_ingestion: bool,
    members: Vec<String>,
}

impl PreparedRow {
    pub fn new(
        row: ImportRow,
        state: Option<ReviewRowState>,
        batch: &ImportBatch,
        directory: &Directory,
        stale_account: bool,
    ) -> Result<Self, ImportError> {
        let owner_entity_id = state
            .as_ref()
            .and_then(|state| state.entity_id.clone())
            .or_else(|| row.entity_id.clone());
        let entity_id = owner_entity_id
            .as_ref()
            .and_then(|owner| directory.owners.get(owner).cloned());
        let source_record_id = state
            .as_ref()
            .and_then(|state| state.source_record_id.clone())
            .or_else(|| row.source_record_id.clone());
        let source_revision = state
            .as_ref()
            .and_then(|state| state.source_revision)
            .or(row.source_revision);
        let source =
            directory.source_for(&batch.account_id, &batch.collection_key, &row.record_key);
        let stale_source = stale_account
            || source_record_id.as_deref() != source.map(|source| source.id.as_str())
            || source_revision != source.map(|source| source.revision)
            || owner_entity_id.as_deref() != source.map(|source| source.entity_id.as_str())
            || (owner_entity_id.is_some() && entity_id.is_none());
        let after_ingestion = matches!(row.proposal, RowProposal::NewSource)
            && source_record_id.is_some()
            && entity_id.is_some();
        let record = row
            .payload
            .as_ref()
            .map(|payload| {
                records::incoming(
                    if after_ingestion {
                        entity_id.as_deref().unwrap_or(&row.id)
                    } else {
                        &row.id
                    },
                    payload,
                    &batch.account_id,
                    &batch.collection_key,
                    &row.record_key,
                )
            })
            .transpose()?;
        let members = entity_id
            .as_ref()
            .and_then(|id| directory.groups.get(id))
            .map_or_else(|| vec![row.id.clone()], |group| group.member_ids.clone());
        Ok(Self {
            row,
            state,
            owner_entity_id,
            entity_id,
            source_record_id,
            stale_source,
            record,
            after_ingestion,
            members,
        })
    }

    pub fn engine_candidate(&self) -> Option<IdentityCandidate> {
        if !self.row.errors.is_empty()
            || self.row.removed
            || (self.row.processed && self.owner_entity_id.is_none())
        {
            return None;
        }
        self.record.as_ref().map(|record| IdentityCandidate {
            entity_id: self
                .entity_id
                .clone()
                .unwrap_or_else(|| self.row.id.clone()),
            origin: CandidateOrigin::Batch,
            member_ids: self.members.clone(),
            records: vec![record.clone()],
        })
    }

    pub fn member_ids(&self) -> &[String] {
        &self.members
    }

    pub fn revision(&self, snapshot: &str) -> Result<String, ImportError> {
        Ok(crate::digest::sha256_hex(&serde_json::to_vec(&(
            snapshot,
            &self.row.id,
        ))?))
    }
}
