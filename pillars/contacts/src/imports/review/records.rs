use std::collections::BTreeSet;

use crate::identity::{
    normalize_email, normalize_phone, normalize_phone_for_country, CompleteName, E164Phone,
    IdentityRecord, NameEvidence, NormalizedEmail, SourceIdentity,
};
use crate::persons::model::{
    ContactPoint, ContactPointInput, ContactPointKind, NameCompleteness, PersonName,
};
use crate::sources::model::SourceRecord;

use super::super::model::ImportPayload;
use super::super::service::ImportError;

pub(super) fn incoming(
    id: &str,
    payload: &ImportPayload,
    account_id: &str,
    collection_key: &str,
    record_key: &str,
) -> Result<IdentityRecord, ImportError> {
    let (emails, phones) = input_points(&payload.points);
    Ok(IdentityRecord {
        id: id.to_owned(),
        source: namespaced_source(account_id, collection_key, record_key)?,
        emails,
        phones,
        name: name_evidence(payload.display_name.clone(), &payload.name),
    })
}

pub(super) fn local(
    id: &str,
    display_name: &str,
    name: Option<&PersonName>,
    points: &[ContactPoint],
) -> IdentityRecord {
    let (emails, phones) = stored_points(
        points
            .iter()
            .filter(|point| point.entity_id == id && point.source_record_id.is_none()),
    );
    IdentityRecord {
        id: id.to_owned(),
        source: None,
        emails,
        phones,
        name: name.map_or_else(
            || NameEvidence {
                display_name: Some(display_name.to_owned()),
                complete_name: None,
            },
            |name| name_evidence(Some(display_name.to_owned()), name),
        ),
    }
}

pub(super) fn source(
    record: &SourceRecord,
    points: &[ContactPoint],
) -> Result<IdentityRecord, ImportError> {
    let (emails, phones) = stored_points(
        points
            .iter()
            .filter(|point| point.source_record_id.as_deref() == Some(&record.id)),
    );
    let name = source_name(record);
    Ok(IdentityRecord {
        id: record.id.clone(),
        source: namespaced_source(
            &record.account_id,
            &record.collection_key,
            &record.record_key,
        )?,
        emails,
        phones,
        name: if record.active {
            name_evidence(record.display_name.clone(), &name)
        } else {
            NameEvidence::default()
        },
    })
}

pub(super) fn source_name(record: &SourceRecord) -> PersonName {
    PersonName {
        given_name: record.given_name.clone(),
        additional_names: record.additional_names.clone(),
        family_name: record.family_name.clone(),
        name_prefix: record.name_prefix.clone(),
        name_suffix: record.name_suffix.clone(),
        completeness: match record.name_completeness.as_str() {
            "complete" => NameCompleteness::Complete,
            "incomplete" => NameCompleteness::Incomplete,
            _ => NameCompleteness::Unknown,
        },
    }
}

fn namespaced_source(
    account: &str,
    collection: &str,
    key: &str,
) -> Result<Option<SourceIdentity>, ImportError> {
    let namespace = serde_json::to_string(&(account, collection))?;
    Ok(SourceIdentity::new(&namespace, key))
}

fn name_evidence(display_name: Option<String>, name: &PersonName) -> NameEvidence {
    NameEvidence {
        display_name,
        complete_name: (name.completeness == NameCompleteness::Complete)
            .then(|| {
                CompleteName::with_parts(
                    name.given_name.as_deref().unwrap_or_default(),
                    name.additional_names.as_deref().unwrap_or_default(),
                    name.family_name.as_deref().unwrap_or_default(),
                    name.name_suffix.as_deref().unwrap_or_default(),
                )
            })
            .flatten(),
    }
}

fn input_points(points: &[ContactPointInput]) -> (Vec<NormalizedEmail>, Vec<E164Phone>) {
    let emails = points
        .iter()
        .filter(|point| point.kind == ContactPointKind::Email)
        .filter_map(normalized_point)
        .filter_map(|value| NormalizedEmail::new(&value))
        .collect::<BTreeSet<_>>();
    let phones = points
        .iter()
        .filter(|point| point.kind == ContactPointKind::Phone)
        .filter_map(normalized_point)
        .filter_map(|value| E164Phone::new(&value))
        .collect::<BTreeSet<_>>();
    (emails.into_iter().collect(), phones.into_iter().collect())
}

pub(super) fn normalized_point(point: &ContactPointInput) -> Option<String> {
    match point.kind {
        ContactPointKind::Email => normalize_email(&point.value),
        ContactPointKind::Phone => point.country_code.as_deref().map_or_else(
            || normalize_phone(&point.value),
            |country| normalize_phone_for_country(&point.value, country),
        ),
        ContactPointKind::Social | ContactPointKind::Url => None,
    }
}

fn stored_points<'a>(
    points: impl Iterator<Item = &'a ContactPoint>,
) -> (Vec<NormalizedEmail>, Vec<E164Phone>) {
    let mut emails = BTreeSet::new();
    let mut phones = BTreeSet::new();
    for point in points.filter(|point| point.active || point.preferred) {
        if let Some(value) = point.normalized_value.as_deref() {
            match point.kind.as_str() {
                "email" => {
                    emails.extend(NormalizedEmail::new(value));
                }
                "phone" => {
                    phones.extend(E164Phone::new(value));
                }
                _ => {}
            }
        }
    }
    (emails.into_iter().collect(), phones.into_iter().collect())
}
