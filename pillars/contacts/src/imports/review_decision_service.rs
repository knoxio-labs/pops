//! One reserved SQLite transaction owns reviewed-row ingestion, separation and subset merge.

use std::collections::{BTreeMap, BTreeSet};

use sqlx::{SqliteConnection, SqlitePool};

use super::model::{ImportBatch, ImportRow, RowAction};
use super::review_decision_model::{ReviewDecisionInput, ReviewDecisionReceipt};
use super::review_state::{self, CandidateDecision};
use super::service::{self, ImportError};
use crate::digest::sha256_hex;
use crate::merges::model::{FieldSelection, MergeBody, MergeField, SeparateBody, SourceMergeField};
use crate::merges::{decisions, repo as merges, service as merge_service};

impl From<merges::MergeError> for ImportError {
    fn from(error: merges::MergeError) -> Self {
        match error {
            merges::MergeError::Invalid(_) => Self::Invalid("Invalid import review selection"),
            merges::MergeError::NotFound(_) => Self::NotFound,
            merges::MergeError::Conflict { .. } => {
                Self::Conflict("Identity decision changed or conflicts with a retained decision")
            }
            merges::MergeError::Db(_) => Self::Storage,
        }
    }
}

/// Apply a reviewed row atomically, checking an exact retry receipt before any revision fence.
/// Child merge/separation helpers share the transaction; failures roll back every preceding write.
pub async fn decide(
    pool: &SqlitePool,
    batch_id: &str,
    input: &ReviewDecisionInput,
) -> Result<ReviewDecisionReceipt, ImportError> {
    validate(input)?;
    let hash = sha256_hex(&serde_json::to_vec(input)?);
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let stored: Option<(String, String)> = sqlx::query_as("SELECT body_hash,receipt FROM contact_import_review_receipts WHERE batch_id=?1 AND idempotency_key=?2")
        .bind(batch_id).bind(&input.idempotency_key).fetch_optional(&mut *tx).await?;
    if let Some((stored_hash, receipt)) = stored {
        if stored_hash != hash {
            return Err(ImportError::Conflict(
                "The idempotency key was used with a different request",
            ));
        }
        return Ok(serde_json::from_str(&receipt)?);
    }
    let batch = super::repo::get_batch(&mut tx, batch_id).await?;
    service::validate_batch_fences(&mut tx, &batch).await?;
    let snapshot = super::review::snapshot(&mut tx, batch_id).await?;
    let authorization = snapshot.authorize(&input.row_id)?;
    if input.batch_revision != authorization.batch_revision
        || input.directory_revision != authorization.directory_revision
        || input.proposal_revision != authorization.proposal_revision
        || authorization.stale_source
    {
        return Err(ImportError::Conflict("Review changed; reload the proposal"));
    }
    let candidates: BTreeSet<String> = authorization.candidate_ids().map(str::to_owned).collect();
    for id in input
        .merge_entity_ids
        .iter()
        .chain(&input.different_entity_ids)
        .chain(&input.later_entity_ids)
    {
        if !candidates.contains(id) {
            return Err(ImportError::Invalid(
                "A selected identity is not a candidate for this row",
            ));
        }
    }
    if input
        .merge_entity_ids
        .iter()
        .any(|id| authorization.blocked_entity_ids.contains(id))
    {
        return Err(ImportError::Conflict(
            "A retained keep-separate decision prevents this merge",
        ));
    }
    validate_pair_budget(&mut tx, authorization.entity_id.as_deref(), input).await?;
    let row = batch
        .rows
        .iter()
        .find(|row| row.id == input.row_id)
        .ok_or(ImportError::NotFound)?;
    if !row.errors.is_empty() || row.removed {
        return Err(ImportError::Invalid(
            "This source row cannot be reviewed as a person",
        ));
    }
    let previous = review_state::get(&mut tx, &input.row_id).await?;
    let mut choices = previous
        .as_ref()
        .map(|state| state.decisions.clone())
        .unwrap_or_default();
    let defer_only = !input.later_entity_ids.is_empty()
        && input.merge_entity_ids.is_empty()
        && input.different_entity_ids.is_empty();
    if defer_only && (!input.selections.is_empty() || !input.preferred_point_ids.is_empty()) {
        return Err(ImportError::Invalid(
            "Deferring candidates cannot change preferred values",
        ));
    }
    let mut entity_id = authorization.entity_id.clone();
    let mut source_record_id = authorization.source_record_id.clone();
    let mut created = false;
    if !defer_only
        && previous
            .as_ref()
            .and_then(|state| state.entity_id.as_ref())
            .is_none()
    {
        let action = if row.source_record_id.is_some() {
            RowAction::UpdateSource
        } else {
            RowAction::CreatePerson
        };
        service::validate_decision(&mut tx, &batch, row, &action).await?;
        let applied = service::apply_decision(&mut tx, &batch, row, &action).await?;
        let owner = applied.entity_id.ok_or(ImportError::Storage)?;
        entity_id = merges::resolve_one(&mut tx, &owner).await?;
        source_record_id = applied.source_record_id;
        created = matches!(action, RowAction::CreatePerson);
    }
    let mut selections = input.selections.clone();
    if created
        && !selections
            .iter()
            .any(|selection| selection.field() == MergeField::PersonProfile)
        && row
            .payload
            .as_ref()
            .is_some_and(|payload| has_structured_name(&payload.name))
    {
        selections.push(FieldSelection::SourceRecord {
            field: SourceMergeField::PersonProfile,
            source_record_id: source_record_id.clone().ok_or(ImportError::Storage)?,
        });
    }
    let operation_id = if !defer_only {
        let canonical = entity_id.as_ref().ok_or(ImportError::Storage)?;
        let mut roots = input.merge_entity_ids.clone();
        roots.push(canonical.clone());
        for (left_index, left) in roots.iter().enumerate() {
            for (right_index, right) in input.different_entity_ids.iter().enumerate() {
                let index = left_index * input.different_entity_ids.len() + right_index;
                let revision = merges::revision(&mut tx).await?;
                decisions::decide_in_transaction(
                    &mut tx,
                    SeparateBody {
                        left_id: left.clone(),
                        right_id: right.clone(),
                        keep_separate: true,
                        expected_revision: revision,
                        idempotency_key: format!("review:{hash}:pair:{index}"),
                        evidence: "Explicit import review candidate decision".into(),
                    },
                )
                .await?;
            }
        }
        if input.merge_entity_ids.is_empty() {
            if !selections.is_empty() || !input.preferred_point_ids.is_empty() {
                merge_service::select_in_transaction(
                    &mut tx,
                    canonical,
                    &selections,
                    &input.preferred_point_ids,
                )
                .await?;
            }
            None
        } else {
            let revision = merges::revision(&mut tx).await?;
            Some(
                merge_service::merge_in_transaction(
                    &mut tx,
                    MergeBody {
                        canonical_id: canonical.clone(),
                        member_ids: input.merge_entity_ids.clone(),
                        expected_revision: revision,
                        idempotency_key: format!("review:{hash}:merge"),
                        evidence: "Explicit import review selected subset".into(),
                        selections,
                        preferred_point_ids: input.preferred_point_ids.clone(),
                    },
                )
                .await?
                .operation_id,
            )
        }
    } else {
        None
    };
    record_choices(&mut choices, &candidates, input);
    review_state::save_decisions(&mut tx, &input.row_id, &choices).await?;
    let pending_entity_ids: Vec<String> = candidates
        .into_iter()
        .filter(|id| {
            !matches!(
                choices.get(id),
                Some(CandidateDecision::Merged | CandidateDecision::Different)
            )
        })
        .collect();
    let processed = entity_id.is_some()
        && pending_entity_ids.is_empty()
        && authorization.pending_row_ids.is_empty();
    let receipt = ReviewDecisionReceipt {
        batch_id: batch.id.clone(),
        row_id: row.id.clone(),
        batch_revision: batch.revision.checked_add(1).ok_or(ImportError::Storage)?,
        directory_revision: merges::revision(&mut tx).await?,
        entity_id,
        operation_id,
        pending_entity_ids,
        processed,
    };
    finish(&mut tx, &batch, row, &hash, input, &receipt).await?;
    tx.commit().await?;
    Ok(receipt)
}

async fn validate_pair_budget(
    conn: &mut SqliteConnection,
    canonical: Option<&str>,
    input: &ReviewDecisionInput,
) -> Result<(), ImportError> {
    if input.different_entity_ids.is_empty() {
        return Ok(());
    }
    let mut left_count = if let Some(id) = canonical {
        merges::members(conn, id).await?.len()
    } else {
        1
    };
    for id in &input.merge_entity_ids {
        left_count = left_count.saturating_add(merges::members(conn, id).await?.len());
    }
    let mut right_count = 0usize;
    for id in &input.different_entity_ids {
        right_count = right_count.saturating_add(merges::members(conn, id).await?.len());
        if left_count.saturating_mul(right_count) > 10_000 {
            return Err(ImportError::Invalid(
                "Review exceeds 10000 stable member separation pairs",
            ));
        }
    }
    Ok(())
}

fn has_structured_name(name: &crate::persons::model::PersonName) -> bool {
    [
        &name.given_name,
        &name.additional_names,
        &name.family_name,
        &name.name_prefix,
        &name.name_suffix,
    ]
    .into_iter()
    .any(|part| part.as_ref().is_some_and(|value| !value.trim().is_empty()))
}

fn validate(input: &ReviewDecisionInput) -> Result<(), ImportError> {
    if input.batch_revision < 1
        || input.directory_revision < 0
        || input.proposal_revision.len() != 64
        || input.row_id.is_empty()
        || input.row_id.len() > 1024
        || input.idempotency_key.trim().is_empty()
        || input.idempotency_key.len() > 128
        || input.merge_entity_ids.len() > 499
        || input.different_entity_ids.len() > 499
        || input.later_entity_ids.len() > 10_000
        || input.selections.len() > 9
        || input.preferred_point_ids.len() > 4
        || (input.merge_entity_ids.len() + 1) * input.different_entity_ids.len() > 1000
    {
        return Err(ImportError::Invalid(
            "Review identifiers and selections must be bounded",
        ));
    }
    let mut unique = BTreeSet::new();
    for id in input
        .merge_entity_ids
        .iter()
        .chain(&input.different_entity_ids)
        .chain(&input.later_entity_ids)
    {
        if id.is_empty() || id.len() > 1024 || !unique.insert(id) {
            return Err(ImportError::Invalid(
                "Candidate choices must have distinct bounded identities",
            ));
        }
    }
    Ok(())
}

fn record_choices(
    choices: &mut BTreeMap<String, CandidateDecision>,
    candidates: &BTreeSet<String>,
    input: &ReviewDecisionInput,
) {
    for candidate in candidates {
        choices
            .entry(candidate.clone())
            .or_insert(CandidateDecision::Later);
    }
    for (ids, choice) in [
        (&input.merge_entity_ids, CandidateDecision::Merged),
        (&input.different_entity_ids, CandidateDecision::Different),
        (&input.later_entity_ids, CandidateDecision::Later),
    ] {
        for id in ids {
            choices.insert(id.clone(), choice);
        }
    }
}

async fn finish(
    conn: &mut SqliteConnection,
    batch: &ImportBatch,
    row: &ImportRow,
    hash: &str,
    input: &ReviewDecisionInput,
    receipt: &ReviewDecisionReceipt,
) -> Result<(), ImportError> {
    sqlx::query("UPDATE contact_import_rows SET processed=?1 WHERE id=?2 AND batch_id=?3")
        .bind(receipt.processed)
        .bind(&row.id)
        .bind(&batch.id)
        .execute(&mut *conn)
        .await?;
    sqlx::query("UPDATE contact_import_batches SET revision=?1 WHERE id=?2")
        .bind(receipt.batch_revision)
        .bind(&batch.id)
        .execute(&mut *conn)
        .await?;
    sqlx::query("INSERT INTO contact_import_review_receipts(batch_id,idempotency_key,body_hash,receipt) VALUES(?1,?2,?3,?4)")
        .bind(&batch.id).bind(&input.idempotency_key).bind(hash).bind(serde_json::to_string(receipt)?).execute(conn).await?;
    Ok(())
}
