//! Parses Google Contacts CSV and vCard 3.0/4.0 without identity matching.

use serde::{Deserialize, Serialize};

mod csv;
mod vcard;

#[cfg(test)]
mod tests;

/// Maximum uploaded bytes accepted before decoding or allocating parser records.
pub const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
/// Maximum records accepted in one batch, including invalid records.
pub const MAX_RECORDS: usize = 10_000;
/// Maximum decoded bytes in one source field.
pub const MAX_FIELD_BYTES: usize = 16 * 1024;

/// Explicit file encoding; no locale-dependent encoding detection is performed.
#[derive(Debug, Clone, Copy)]
pub enum FileEncoding {
    Utf8,
    Utf16Le,
    Utf16Be,
    Windows1252,
}

/// Source format selected by the caller rather than inferred from content.
#[derive(Debug, Clone, Copy)]
pub enum FileFormat {
    GoogleCsv,
    Vcard,
}

/// Structured source components; empty strings represent absent components.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceName {
    pub given: String,
    pub additional: String,
    pub family: String,
    pub prefix: String,
    pub suffix: String,
}

/// A contact point retained verbatim, without identity normalization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourcePoint {
    pub value: String,
    pub label: Option<String>,
}

/// Parsed contact evidence. `record_id` identifies a row only inside this batch;
/// `uid` is separately retained provider evidence, never inferred from a name.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceContact {
    pub record_id: String,
    pub display_name: Option<String>,
    pub structured_name: Option<SourceName>,
    pub uid: Option<String>,
    pub emails: Vec<SourcePoint>,
    pub phones: Vec<SourcePoint>,
    pub urls: Vec<SourcePoint>,
}

/// A rejected source record, identified by batch ordinal with a non-sensitive error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordError {
    pub record_id: String,
    pub message: String,
}

/// Successful records and retained record errors; no writes or merging occur.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParseResult {
    pub contacts: Vec<SourceContact>,
    pub errors: Vec<RecordError>,
}

impl ParseResult {
    fn reject(&mut self, record_id: String, message: &str) {
        self.errors.push(RecordError {
            record_id,
            message: message.to_owned(),
        });
    }
}

/// Decode and parse a bounded upload. File-level failures return an error;
/// malformed individual records remain in `ParseResult::errors`.
pub fn parse_file(
    bytes: &[u8],
    format: FileFormat,
    encoding: FileEncoding,
) -> Result<ParseResult, String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err("File exceeds byte limit".to_owned());
    }
    let decoder = match encoding {
        FileEncoding::Utf8 => encoding_rs::UTF_8,
        FileEncoding::Utf16Le => encoding_rs::UTF_16LE,
        FileEncoding::Utf16Be => encoding_rs::UTF_16BE,
        FileEncoding::Windows1252 => encoding_rs::WINDOWS_1252,
    };
    let (text, malformed) = decoder.decode_without_bom_handling(bytes);
    if malformed {
        return Err("File contains invalid characters for selected encoding".to_owned());
    }
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    if text.len() > MAX_FILE_BYTES * 3 {
        return Err("Decoded file exceeds byte limit".to_owned());
    }
    match format {
        FileFormat::GoogleCsv => csv::parse(text),
        FileFormat::Vcard => vcard::parse(text),
    }
}

fn nonempty(value: &str) -> Option<String> {
    (!value.trim().is_empty()).then(|| value.to_owned())
}

fn validate(contact: &SourceContact) -> bool {
    contact.display_name.is_some()
        || contact.structured_name.is_some()
        || !contact.emails.is_empty()
        || !contact.phones.is_empty()
        || !contact.urls.is_empty()
}
