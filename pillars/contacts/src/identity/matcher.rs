use std::collections::{BTreeMap, BTreeSet};

use super::normalize::normalize_name;
use super::{
    CandidateOrigin, IdentityCandidate, IdentityOutcome, IdentityRecord, KeepSeparate, MatchReason,
    ReviewReason,
};

/// Classifies an observation against the complete existing and incoming candidate set.
/// Trusted bindings bypass identity guesses; ambiguous signals and rejected group members never merge.
pub fn classify(
    incoming: &IdentityRecord,
    candidates: &[IdentityCandidate],
    decisions: &[KeepSeparate],
) -> IdentityOutcome {
    let groups = groups_without_self(incoming, candidates);
    let source_matches = |origin| -> BTreeSet<String> {
        candidates
            .iter()
            .filter(|candidate| candidate.origin == origin)
            .filter(|candidate| {
                incoming.source.as_ref().is_some_and(|source| {
                    candidate.records.iter().any(|record| {
                        (origin == CandidateOrigin::Existing || record.id != incoming.id)
                            && record.source.as_ref() == Some(source)
                    })
                })
            })
            .map(|candidate| candidate.entity_id.clone())
            .collect()
    };
    let bound = source_matches(CandidateOrigin::Existing);
    if bound.len() > 1 {
        return review(ReviewReason::ConflictingSourceBindings, bound);
    }
    if let Some(entity_id) = bound.into_iter().next() {
        return IdentityOutcome::RecognizedSource { entity_id };
    }
    let repeated_source = source_matches(CandidateOrigin::Batch);
    if !repeated_source.is_empty() {
        return review(ReviewReason::BatchCollision, repeated_source);
    }

    let mut matches: BTreeMap<String, BTreeSet<MatchReason>> = BTreeMap::new();
    let mut weak = BTreeSet::new();
    for (id, records) in &groups {
        for record in records {
            let reasons = strong_matches(incoming, record);
            if !reasons.is_empty() {
                matches.entry(id.clone()).or_default().extend(reasons);
            } else if same_display_name(incoming, record) {
                weak.insert(id.clone());
            }
        }
    }
    if matches.is_empty() {
        return if weak.is_empty() {
            IdentityOutcome::New
        } else {
            review(ReviewReason::IncompleteName, weak)
        };
    }
    let ids: BTreeSet<_> = matches.keys().cloned().collect();
    if matches.values().all(|reasons| {
        reasons
            .iter()
            .all(|reason| *reason == MatchReason::CompleteName)
    }) && weak.iter().any(|id| !ids.contains(id))
    {
        return review(
            ReviewReason::AmbiguousName,
            ids.union(&weak).cloned().collect(),
        );
    }
    if matches.len() > 1 {
        let reason = if shared_identifier(incoming, &groups) {
            ReviewReason::SharedIdentifier
        } else if matches.values().all(|reasons| {
            reasons
                .iter()
                .all(|reason| *reason == MatchReason::CompleteName)
        }) {
            ReviewReason::AmbiguousName
        } else {
            ReviewReason::ConflictingSignals
        };
        return review(reason, ids);
    }
    let Some((entity_id, reasons)) = matches.into_iter().next() else {
        return IdentityOutcome::New;
    };
    if rejected(incoming, &entity_id, candidates, decisions) {
        return review(ReviewReason::KeepSeparate, ids);
    }
    let collision: BTreeSet<_> = groups
        .iter()
        .filter(|(other_id, records)| {
            **other_id != entity_id
                && groups.get(&entity_id).is_some_and(|matched_records| {
                    matched_records.iter().any(|matched| {
                        records
                            .iter()
                            .any(|record| !strong_matches(matched, record).is_empty())
                    })
                })
        })
        .map(|(id, _)| id.clone())
        .collect();
    if !collision.is_empty() {
        return review(
            ReviewReason::BatchCollision,
            collision.union(&ids).cloned().collect(),
        );
    }
    let Some(reason) = reasons.into_iter().next() else {
        return IdentityOutcome::New;
    };
    IdentityOutcome::AutoMatch { entity_id, reason }
}

fn groups_without_self<'a>(
    incoming: &IdentityRecord,
    candidates: &'a [IdentityCandidate],
) -> BTreeMap<String, Vec<&'a IdentityRecord>> {
    let mut groups: BTreeMap<String, Vec<&IdentityRecord>> = BTreeMap::new();
    for candidate in candidates {
        let records: Vec<_> = candidate
            .records
            .iter()
            .filter(|record| {
                candidate.origin == CandidateOrigin::Existing || record.id != incoming.id
            })
            .collect();
        if !records.is_empty() {
            groups
                .entry(candidate.entity_id.clone())
                .or_default()
                .extend(records);
        }
    }
    groups
}

fn strong_matches(left: &IdentityRecord, right: &IdentityRecord) -> BTreeSet<MatchReason> {
    let mut reasons = BTreeSet::new();
    if left.emails.iter().any(|email| right.emails.contains(email)) {
        reasons.insert(MatchReason::Email);
    }
    if left.phones.iter().any(|phone| right.phones.contains(phone)) {
        reasons.insert(MatchReason::Phone);
    }
    if left
        .name
        .complete_name
        .as_ref()
        .is_some_and(|name| right.name.complete_name.as_ref() == Some(name))
    {
        reasons.insert(MatchReason::CompleteName);
    }
    reasons
}

fn display_key(record: &IdentityRecord) -> Option<String> {
    record
        .name
        .display_name
        .as_ref()
        .map(|name| normalize_name(name))
        .or_else(|| {
            record
                .name
                .complete_name
                .as_ref()
                .map(|name| name.as_str().to_owned())
        })
        .filter(|name| !name.is_empty())
}

fn same_display_name(left: &IdentityRecord, right: &IdentityRecord) -> bool {
    display_key(left).is_some_and(|name| display_key(right).as_ref() == Some(&name))
}

fn shared_identifier(
    incoming: &IdentityRecord,
    groups: &BTreeMap<String, Vec<&IdentityRecord>>,
) -> bool {
    incoming.emails.iter().any(|email| {
        groups
            .values()
            .filter(|records| records.iter().any(|record| record.emails.contains(email)))
            .count()
            > 1
    }) || incoming.phones.iter().any(|phone| {
        groups
            .values()
            .filter(|records| records.iter().any(|record| record.phones.contains(phone)))
            .count()
            > 1
    })
}

fn rejected(
    incoming: &IdentityRecord,
    entity_id: &str,
    candidates: &[IdentityCandidate],
    decisions: &[KeepSeparate],
) -> bool {
    let mut incoming_members = BTreeSet::from([incoming.id.as_str()]);
    let mut target_members = BTreeSet::from([entity_id]);
    for candidate in candidates {
        let members = candidate
            .member_ids
            .iter()
            .map(String::as_str)
            .chain(candidate.records.iter().map(|record| record.id.as_str()))
            .chain(std::iter::once(candidate.entity_id.as_str()));
        if candidate
            .records
            .iter()
            .any(|record| record.id == incoming.id)
            || candidate.member_ids.contains(&incoming.id)
        {
            incoming_members.extend(members.clone());
        }
        if candidate.entity_id == entity_id {
            target_members.extend(members);
        }
    }
    decisions.iter().any(|decision| {
        (incoming_members.contains(decision.left_id.as_str())
            && target_members.contains(decision.right_id.as_str()))
            || (incoming_members.contains(decision.right_id.as_str())
                && target_members.contains(decision.left_id.as_str()))
    })
}

fn review(reason: ReviewReason, candidates: BTreeSet<String>) -> IdentityOutcome {
    IdentityOutcome::Review {
        reason,
        candidates: candidates.into_iter().collect(),
    }
}
