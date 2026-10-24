use super::{
    nonempty, validate, ParseResult, SourceContact, SourceName, SourcePoint, MAX_FIELD_BYTES,
    MAX_RECORDS,
};
use std::io::Cursor;

pub(super) fn parse(text: &str) -> Result<ParseResult, String> {
    let mut output = ParseResult::default();
    let mut card = String::new();
    let mut count = 0;
    let mut outside_error = false;
    for line in text.lines() {
        if line.eq_ignore_ascii_case("BEGIN:VCARD") {
            if !card.is_empty() {
                output.reject(format!("vcard:{count}"), "Unclosed vCard");
            }
            count += 1;
            if count > MAX_RECORDS {
                return Err("File exceeds record limit".to_owned());
            }
            card.clear();
            card.push_str(line);
            card.push('\n');
        } else if card.is_empty() {
            if !line.trim().is_empty() {
                outside_error = true;
            }
        } else {
            card.push_str(line);
            card.push('\n');
            if line.eq_ignore_ascii_case("END:VCARD") {
                let record_id = format!("vcard:{count}");
                match parse_card(&card, record_id.clone()) {
                    Ok(contact) => output.contacts.push(contact),
                    Err(error) => output.reject(record_id, error),
                }
                card.clear();
            }
        }
    }
    if !card.is_empty() {
        output.reject(format!("vcard:{count}"), "Unclosed vCard");
    }
    if outside_error {
        output.reject("vcard:outside".to_owned(), "Content outside vCard");
    }
    if count == 0 {
        return Err("File contains no vCards".to_owned());
    }
    Ok(output)
}

fn parse_card(text: &str, record_id: String) -> Result<SourceContact, &'static str> {
    let original_lines = unfold(text)?;
    let card = ical::VcardParser::new(Cursor::new(text.as_bytes()))
        .next()
        .ok_or("Missing vCard")?
        .map_err(|_| "Malformed vCard")?;
    let mut contact = SourceContact {
        record_id,
        ..SourceContact::default()
    };
    let mut version = None;
    if card.properties.len() + 2 != original_lines.len() {
        return Err("Malformed vCard property count");
    }
    for (property, original) in card
        .properties
        .into_iter()
        .zip(original_lines.iter().skip(1))
    {
        let params = property.params.unwrap_or_default();
        let name = property.name.rsplit('.').next().unwrap_or(&property.name);
        if !matches!(
            name,
            "VERSION" | "FN" | "UID" | "N" | "EMAIL" | "TEL" | "URL" | "X-SOCIALPROFILE"
        ) {
            continue;
        }
        let value = raw_value(original)?.to_owned();
        if value.len() > MAX_FIELD_BYTES
            || params
                .iter()
                .any(|(_, values)| values.iter().any(|value| value.len() > MAX_FIELD_BYTES))
        {
            return Err("Field exceeds byte limit");
        }
        if params
            .iter()
            .any(|(key, _)| key == "ENCODING" || key == "CHARSET")
        {
            return Err(
                "Legacy property encoding is unsupported; export vCard 3.0 or 4.0 as Unicode",
            );
        }
        let label = params
            .iter()
            .find(|(key, _)| key == "TYPE")
            .map(|(_, values)| values.join(","));
        match name {
            "VERSION" => {
                if version.replace(value).is_some() {
                    return Err("Duplicate vCard version");
                }
            }
            "FN" => {
                if contact.display_name.is_some() {
                    return Err("Duplicate formatted name");
                }
                contact.display_name = nonempty(&unescape(&value)?);
            }
            "UID" => {
                if contact.uid.is_some() {
                    return Err("Duplicate UID");
                }
                contact.uid = nonempty(&value);
            }
            "N" => {
                if contact.structured_name.is_some() {
                    return Err("Duplicate structured name");
                }
                let fields = name_fields(&value)?;
                if fields.len() != 5 {
                    return Err("Structured name requires five components");
                }
                let structured = SourceName {
                    family: fields[0].clone(),
                    given: fields[1].clone(),
                    additional: fields[2].clone(),
                    prefix: fields[3].clone(),
                    suffix: fields[4].clone(),
                };
                contact.structured_name =
                    (structured != SourceName::default()).then_some(structured);
            }
            "EMAIL" | "TEL" | "URL" | "X-SOCIALPROFILE" => {
                if let Some(value) = nonempty(&unescape(&value)?) {
                    let point = SourcePoint { value, label };
                    match name {
                        "EMAIL" => contact.emails.push(point),
                        "TEL" => contact.phones.push(point),
                        _ => contact.urls.push(point),
                    }
                }
            }
            _ => {}
        }
    }
    if !matches!(version.as_deref(), Some("3.0" | "4.0")) {
        return Err("Supported vCard versions are 3.0 and 4.0");
    }
    if !validate(&contact) {
        return Err("Contact has no supported fields");
    }
    Ok(contact)
}

// Preserve significant trailing spaces which the dependency's line reader trims.
fn unfold(text: &str) -> Result<Vec<String>, &'static str> {
    let mut lines: Vec<String> = Vec::new();
    for line in text.lines().filter(|line| !line.is_empty()) {
        if let Some(continuation) = line.strip_prefix([' ', '\t']) {
            lines
                .last_mut()
                .ok_or("Orphan folded line")?
                .push_str(continuation);
        } else {
            lines.push(line.to_owned());
        }
    }
    Ok(lines)
}

fn raw_value(line: &str) -> Result<&str, &'static str> {
    let mut quoted = false;
    for (index, character) in line.char_indices() {
        if character == '"' {
            quoted = !quoted;
        }
        if character == ':' && !quoted {
            return Ok(&line[index + 1..]);
        }
    }
    Err("Missing vCard value delimiter")
}

fn name_fields(value: &str) -> Result<Vec<String>, &'static str> {
    let mut fields = Vec::new();
    let mut start = 0;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if character == ';' && !escaped {
            fields.push(unescape(&value[start..index])?);
            start = index + 1;
        }
        escaped = character == '\\' && !escaped;
    }
    fields.push(unescape(&value[start..])?);
    Ok(fields)
}

fn unescape(value: &str) -> Result<String, &'static str> {
    let mut output = String::with_capacity(value.len());
    let mut characters = value.chars();
    while let Some(character) = characters.next() {
        if character != '\\' {
            output.push(character);
            continue;
        }
        match characters.next() {
            Some('n' | 'N') => output.push('\n'),
            Some(character @ ('\\' | ';' | ',')) => output.push(character),
            _ => return Err("Invalid vCard text escape"),
        }
    }
    Ok(output)
}
