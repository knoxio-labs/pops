use crate::identity::{
    classify, classify_after_ingestion, matching_signals, IdentityOutcome, MatchReason,
    ReviewReason,
};

use super::super::model::RowProposal;
use super::super::review_model::{
    ImportReview, ProposalReason, ReviewCandidate, ReviewClassification, ReviewCounts, ReviewPoint,
    ReviewQuery, ReviewRow,
};
use super::super::service::ImportError;
use super::{records, row::PreparedRow, ReviewSnapshot};

pub(super) struct Plan {
    pub classification: ReviewClassification,
    pub reason: ProposalReason,
    pub candidate_ids: Vec<String>,
}

pub(super) fn plan(snapshot: &ReviewSnapshot, row: &PreparedRow) -> Plan {
    if !row.row.errors.is_empty() || matches!(row.row.proposal, RowProposal::Invalid) {
        return Plan {
            classification: ReviewClassification::Review,
            reason: ProposalReason::InvalidRecord,
            candidate_ids: Vec::new(),
        };
    }
    let mut plan = if row.row.removed {
        Plan {
            classification: ReviewClassification::Automatic,
            reason: ProposalReason::SourceRemoval,
            candidate_ids: Vec::new(),
        }
    } else if let Some(incoming) = &row.record {
        let outcome = if row.after_ingestion {
            classify_after_ingestion(
                incoming,
                &snapshot.candidates,
                &snapshot.directory.negatives,
            )
        } else {
            classify(
                incoming,
                &snapshot.candidates,
                &snapshot.directory.negatives,
            )
        };
        match outcome {
            IdentityOutcome::New => Plan {
                classification: ReviewClassification::New,
                reason: ProposalReason::NewPerson,
                candidate_ids: Vec::new(),
            },
            IdentityOutcome::RecognizedSource { entity_id } => Plan {
                classification: ReviewClassification::Automatic,
                reason: ProposalReason::SourceIdentity,
                candidate_ids: vec![entity_id],
            },
            IdentityOutcome::AutoMatch { entity_id, reason } => {
                let existing = snapshot.directory.groups.contains_key(&entity_id);
                Plan {
                    classification: if existing {
                        ReviewClassification::Automatic
                    } else {
                        ReviewClassification::Review
                    },
                    reason: if existing {
                        signal_reason(reason)
                    } else {
                        ProposalReason::BatchMatch
                    },
                    candidate_ids: vec![entity_id],
                }
            }
            IdentityOutcome::Review { reason, candidates } => Plan {
                classification: ReviewClassification::Review,
                reason: review_reason(reason),
                candidate_ids: candidates,
            },
        }
    } else {
        Plan {
            classification: ReviewClassification::Review,
            reason: ProposalReason::InvalidRecord,
            candidate_ids: Vec::new(),
        }
    };
    plan.candidate_ids
        .retain(|id| row.entity_id.as_deref() != Some(id.as_str()));
    if row.stale_source {
        plan.classification = ReviewClassification::Review;
        plan.reason = ProposalReason::StaleSource;
    }
    plan
}

pub(super) fn page(
    snapshot: &ReviewSnapshot,
    query: &ReviewQuery,
) -> Result<ImportReview, ImportError> {
    if !(1..=50).contains(&query.limit)
        || !(1..=200).contains(&query.candidate_limit)
        || (query.candidate_row_id.is_some() && query.proposal_revision.is_none())
    {
        return Err(ImportError::Invalid("Review pages require 1–50 rows, 1–200 candidates and a snapshot proof for candidate pages"));
    }
    if query
        .proposal_revision
        .as_ref()
        .is_some_and(|expected| expected != &snapshot.proposal_revision)
    {
        return Err(ImportError::Conflict(
            "Review changed; reload before reading another page",
        ));
    }
    let selected_index = query
        .candidate_row_id
        .as_ref()
        .map(|id| {
            snapshot
                .rows
                .iter()
                .position(|row| &row.row.id == id)
                .ok_or(ImportError::NotFound)
        })
        .transpose()?;
    let mut counts = ReviewCounts::default();
    let mut rows = Vec::new();
    for (index, row) in snapshot.rows.iter().enumerate() {
        let plan = plan(snapshot, row);
        if plan.reason == ProposalReason::InvalidRecord {
            counts.invalid += 1;
        } else {
            match plan.classification {
                ReviewClassification::Automatic => counts.automatic += 1,
                ReviewClassification::Review => counts.review += 1,
                ReviewClassification::New => counts.new += 1,
            }
        }
        if selected_index.map_or_else(
            || (query.offset..query.offset.saturating_add(query.limit)).contains(&index),
            |selected| selected == index,
        ) {
            rows.push(project_row(snapshot, row, plan, query)?);
        }
    }
    Ok(ImportReview {
        batch_id: snapshot.batch.id.clone(),
        batch_revision: snapshot.batch_revision,
        directory_revision: snapshot.directory_revision,
        proposal_revision: snapshot.proposal_revision.clone(),
        source: snapshot
            .directory
            .batch_source(&snapshot.batch.account_id)?,
        total_rows: snapshot.rows.len(),
        offset: selected_index.unwrap_or(query.offset),
        limit: if selected_index.is_some() {
            1
        } else {
            query.limit
        },
        counts,
        rows,
    })
}

fn project_row(
    snapshot: &ReviewSnapshot,
    row: &PreparedRow,
    plan: Plan,
    query: &ReviewQuery,
) -> Result<ReviewRow, ImportError> {
    let candidate_total = plan.candidate_ids.len();
    let candidates = plan
        .candidate_ids
        .iter()
        .skip(query.candidate_offset)
        .take(query.candidate_limit)
        .map(|id| candidate(snapshot, row, id, plan.reason))
        .collect::<Result<Vec<_>, _>>()?;
    let decisions = row
        .state
        .as_ref()
        .map(|state| state.decisions.clone())
        .unwrap_or_default();
    Ok(ReviewRow {
        row_id: row.row.id.clone(),
        incoming: row.row.payload.clone(),
        processed: row.row.processed,
        entity_id: row.entity_id.clone(),
        owner_entity_id: row.owner_entity_id.clone(),
        source_record_id: row.source_record_id.clone(),
        proposal: row.row.proposal.clone(),
        errors: row.row.errors.clone(),
        classification: plan.classification,
        reason: plan.reason,
        proposal_revision: row.revision(&snapshot.proposal_revision)?,
        stale_source: row.stale_source,
        decisions,
        candidate_total,
        candidate_offset: query.candidate_offset,
        candidate_limit: query.candidate_limit,
        candidates_truncated: query.candidate_offset > 0
            || query.candidate_offset.saturating_add(candidates.len()) < candidate_total,
        candidates,
    })
}

fn candidate(
    snapshot: &ReviewSnapshot,
    row: &PreparedRow,
    id: &str,
    reason: ProposalReason,
) -> Result<ReviewCandidate, ImportError> {
    let (mut candidate, records) = if let Some(group) = snapshot.directory.groups.get(id) {
        (
            group.evidence(&snapshot.directory)?,
            group.records.as_slice(),
        )
    } else {
        let target = snapshot
            .rows
            .iter()
            .find(|row| row.row.id == id)
            .ok_or(ImportError::Storage)?;
        let payload = target.row.payload.as_ref().ok_or(ImportError::Storage)?;
        let mut source = snapshot
            .directory
            .batch_source(&snapshot.batch.account_id)?;
        source.display_name = payload.display_name.clone();
        source.name = payload.name.clone();
        let name = payload.display_name.clone().unwrap_or_else(|| {
            [
                &payload.name.given_name,
                &payload.name.additional_names,
                &payload.name.family_name,
                &payload.name.name_suffix,
            ]
            .into_iter()
            .filter_map(Option::as_deref)
            .collect::<Vec<_>>()
            .join(" ")
        });
        (
            ReviewCandidate {
                entity_id: None,
                row_id: Some(target.row.id.clone()),
                member_ids: Vec::new(),
                name,
                local_name: String::new(),
                person_profile: None,
                local_person_profile: None,
                points: payload
                    .points
                    .iter()
                    .map(|point| ReviewPoint {
                        id: None,
                        owner_entity_id: None,
                        kind: point.kind.as_str().into(),
                        value: point.value.clone(),
                        normalized_value: records::normalized_point(point),
                        label: point.label.clone(),
                        country_code: point.country_code.clone(),
                        source_record_id: None,
                        active: true,
                        preferred: false,
                    })
                    .collect(),
                sources: vec![source],
                reasons: Vec::new(),
                keep_separate: false,
            },
            target.record.as_slice(),
        )
    };
    if let Some(incoming) = &row.record {
        let signals: std::collections::BTreeSet<_> = records
            .iter()
            .flat_map(|record| matching_signals(incoming, record))
            .collect();
        candidate.reasons = signals.into_iter().map(signal_reason).collect();
    }
    if !candidate.reasons.contains(&reason) {
        candidate.reasons.push(reason);
    }
    candidate.keep_separate = snapshot
        .directory
        .separated(row.member_ids(), &candidate.member_ids);
    Ok(candidate)
}

fn signal_reason(reason: MatchReason) -> ProposalReason {
    match reason {
        MatchReason::Email => ProposalReason::Email,
        MatchReason::Phone => ProposalReason::Phone,
        MatchReason::CompleteName => ProposalReason::CompleteName,
    }
}

fn review_reason(reason: ReviewReason) -> ProposalReason {
    match reason {
        ReviewReason::ConflictingSourceBindings => ProposalReason::ConflictingSourceBindings,
        ReviewReason::SharedIdentifier => ProposalReason::SharedIdentifier,
        ReviewReason::ConflictingSignals => ProposalReason::ConflictingSignals,
        ReviewReason::AmbiguousName => ProposalReason::AmbiguousName,
        ReviewReason::IncompleteName => ProposalReason::IncompleteName,
        ReviewReason::KeepSeparate => ProposalReason::KeepSeparate,
        ReviewReason::BatchCollision => ProposalReason::BatchCollision,
    }
}
