use super::{
    nonempty, validate, ParseResult, SourceContact, SourceName, SourcePoint, MAX_FIELD_BYTES,
    MAX_RECORDS,
};
use std::collections::HashSet;

pub(super) fn parse(text: &str) -> Result<ParseResult, String> {
    let mut reader = ::csv::ReaderBuilder::new().from_reader(text.as_bytes());
    let headers = reader.headers().map_err(|_| "Invalid CSV header")?.clone();
    if headers.is_empty()
        || headers.len() > 512
        || headers.iter().any(|value| value.len() > MAX_FIELD_BYTES)
    {
        return Err("Invalid CSV header size".to_owned());
    }
    let mut unique = HashSet::new();
    if headers.iter().any(|header| !unique.insert(header)) {
        return Err("Duplicate CSV header".to_owned());
    }
    if !headers.iter().any(|header| {
        matches!(
            header,
            "Name"
                | "First Name"
                | "Given Name"
                | "E-mail 1 - Value"
                | "Email 1 - Value"
                | "Phone 1 - Value"
        )
    }) {
        return Err("Unsupported Google Contacts CSV header".to_owned());
    }
    let mut output = ParseResult::default();
    let mut index = 0;
    let mut row = ::csv::StringRecord::new();
    loop {
        let result = reader.read_record(&mut row);
        if matches!(result, Ok(false)) {
            break;
        }
        if index >= MAX_RECORDS {
            return Err("File exceeds record limit".to_owned());
        }
        let record_id = format!("csv:{}", index + 1);
        index += 1;
        if result.is_err() {
            output.reject(record_id, "Malformed CSV row");
            continue;
        }
        let start = usize::try_from(row.position().ok_or("Missing CSV position")?.byte())
            .map_err(|_| "Invalid CSV position")?;
        let end = usize::try_from(reader.position().byte()).map_err(|_| "Invalid CSV position")?;
        if !valid_quotes(text.get(start..end).ok_or("Invalid CSV position")?) {
            output.reject(record_id, "Malformed CSV quoting");
            continue;
        }
        if row.iter().any(|value| value.len() > MAX_FIELD_BYTES) {
            output.reject(record_id, "Field exceeds byte limit");
            continue;
        }
        let field = |names: &[&str]| {
            headers
                .iter()
                .position(|header| names.contains(&header))
                .and_then(|index| row.get(index))
                .and_then(nonempty)
        };
        let name = SourceName {
            given: field(&["First Name", "Given Name"]).unwrap_or_default(),
            additional: field(&["Middle Name", "Additional Name"]).unwrap_or_default(),
            family: field(&["Last Name", "Family Name"]).unwrap_or_default(),
            prefix: field(&["Name Prefix"]).unwrap_or_default(),
            suffix: field(&["Name Suffix"]).unwrap_or_default(),
        };
        let structured_name = (name != SourceName::default()).then_some(name);
        let mut contact = SourceContact {
            record_id: record_id.clone(),
            display_name: field(&["Name"]),
            structured_name,
            ..SourceContact::default()
        };
        for (column, header) in headers.iter().enumerate() {
            let Some(value) = row.get(column).and_then(nonempty) else {
                continue;
            };
            let Some(prefix) = header.strip_suffix(" - Value") else {
                continue;
            };
            let target = if prefix.starts_with("E-mail ") || prefix.starts_with("Email ") {
                &mut contact.emails
            } else if prefix.starts_with("Phone ") {
                &mut contact.phones
            } else if prefix.starts_with("Website ") {
                &mut contact.urls
            } else {
                continue;
            };
            let label_header = format!("{prefix} - Type");
            let modern_label_header = format!("{prefix} - Label");
            let label = field(&[&label_header, &modern_label_header]);
            target.push(SourcePoint { value, label });
        }
        if validate(&contact) {
            output.contacts.push(contact);
        } else {
            output.reject(record_id, "Contact has no supported fields");
        }
    }
    Ok(output)
}

// The CSV decoder deliberately tolerates broken quoting; reject it before staging.
fn valid_quotes(record: &str) -> bool {
    enum State {
        Start,
        Unquoted,
        Quoted,
        Closed,
    }
    let mut state = State::Start;
    for byte in record.trim_matches(['\r', '\n']).bytes() {
        state = match (state, byte) {
            (State::Start, b'"') | (State::Closed, b'"') => State::Quoted,
            (State::Quoted, b'"') => State::Closed,
            (State::Quoted, _) => State::Quoted,
            (State::Unquoted, b'"') => return false,
            (_, b',') => State::Start,
            (State::Closed, _) => return false,
            _ => State::Unquoted,
        };
    }
    !matches!(state, State::Quoted)
}
