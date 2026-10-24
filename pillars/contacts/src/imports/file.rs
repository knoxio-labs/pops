//! File-to-preview adaptation with exact-file fallback identity and sanitized errors.

use std::collections::HashMap;

use super::model::{ImportPayload, RowIssue, StageBatchInput, StageRowInput};
use super::parser::{
    parse_file, FileEncoding, FileFormat, ParseResult, SourceContact, SourcePoint, MAX_FILE_BYTES,
};
use super::service::{sha256_hex, ImportError};
use crate::persons::model::{ContactPointInput, ContactPointKind, PersonName};

/// Parse a file into the shared staging input. Without a UID, replay identity is
/// guaranteed only for identical bytes and the same row ordinal and namespace.
pub fn parse_stage_input(
    account_id: String,
    collection_key: String,
    bytes: &[u8],
    format: FileFormat,
    encoding: FileEncoding,
) -> Result<StageBatchInput, ImportError> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(ImportError::Invalid("File exceeds byte limit"));
    }
    let digest = sha256_hex(bytes);
    let parsed = parse_file(bytes, format, encoding).unwrap_or_else(|_| ParseResult {
        contacts: Vec::new(),
        errors: vec![super::parser::RecordError {
            record_id: "file".to_string(),
            message: String::new(),
        }],
    });
    let mut errors: HashMap<String, Vec<RowIssue>> = HashMap::new();
    for error in parsed.errors {
        errors
            .entry(error.record_id)
            .or_default()
            .push(RowIssue::MalformedRecord);
    }
    let mut rows = Vec::with_capacity(parsed.contacts.len() + errors.len());
    for contact in parsed.contacts {
        let issues = errors.remove(&contact.record_id).unwrap_or_default();
        let key = contact
            .uid
            .as_ref()
            .filter(|uid| !uid.trim().is_empty())
            .map_or_else(
                || format!("file:{digest}:{}", contact.record_id),
                |uid| format!("uid:{uid}"),
            );
        rows.push(StageRowInput {
            record_key: key,
            payload: Some(to_payload(contact)),
            removed: false,
            errors: issues,
        });
    }
    let mut rejected: Vec<_> = errors.into_iter().collect();
    rejected.sort_by(|left, right| left.0.cmp(&right.0));
    for (record_id, errors) in rejected {
        rows.push(StageRowInput {
            record_key: format!("file:{digest}:{record_id}"),
            payload: None,
            removed: false,
            errors,
        });
    }
    if rows.is_empty() {
        rows.push(StageRowInput {
            record_key: format!("file:{digest}:empty"),
            payload: None,
            removed: false,
            errors: vec![RowIssue::MalformedRecord],
        });
    }
    Ok(StageBatchInput {
        account_id,
        collection_key,
        rows,
    })
}

fn to_payload(contact: SourceContact) -> ImportPayload {
    let name = contact
        .structured_name
        .map_or_else(PersonName::default, |name| PersonName {
            given_name: present(name.given),
            additional_names: present(name.additional),
            family_name: present(name.family),
            name_prefix: present(name.prefix),
            name_suffix: present(name.suffix),
            ..PersonName::default()
        });
    let display_name = contact.display_name.or_else(|| {
        let components: Vec<&str> = [
            &name.name_prefix,
            &name.given_name,
            &name.additional_names,
            &name.family_name,
            &name.name_suffix,
        ]
        .into_iter()
        .filter_map(Option::as_deref)
        .collect();
        (!components.is_empty()).then(|| components.join(" "))
    });
    let mut points = Vec::new();
    append_points(&mut points, contact.emails, ContactPointKind::Email);
    append_points(&mut points, contact.phones, ContactPointKind::Phone);
    append_points(&mut points, contact.urls, ContactPointKind::Url);
    ImportPayload {
        display_name,
        name,
        points,
    }
}

fn present(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn append_points(
    points: &mut Vec<ContactPointInput>,
    source: Vec<SourcePoint>,
    kind: ContactPointKind,
) {
    points.extend(source.into_iter().map(|point| ContactPointInput {
        kind,
        value: point.value,
        label: point.label,
        country_code: None,
    }));
}
