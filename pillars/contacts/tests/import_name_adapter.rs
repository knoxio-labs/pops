//! Structured name evidence at the actual file-to-preview adapter boundary.

use contacts::imports::file::parse_stage_input;
use contacts::imports::parser::{FileEncoding, FileFormat};
use contacts::persons::model::NameCompleteness;

#[test]
fn csv_and_vcard_explicit_components_qualify_without_changing_original_evidence() {
    for (format, bytes) in [
        (FileFormat::GoogleCsv, "Name,Given Name,Additional Name,Family Name,Name Prefix,Name Suffix\nDisplay Label,Morgan,Lee,Vale,Dr.,Jr.\n"),
        (FileFormat::Vcard, "BEGIN:VCARD\nVERSION:3.0\nFN:Display Label\nN:Vale;Morgan;Lee;Dr.;Jr.\nEND:VCARD\n"),
    ] {
        let input = parse_stage_input("fictional-account".into(), "contacts".into(), bytes.as_bytes(), format, FileEncoding::Utf8).unwrap();
        assert_eq!(input.rows.len(), 1);
        assert!(input.rows[0].errors.is_empty());
        let payload = input.rows[0].payload.as_ref().unwrap();
        assert_eq!(payload.name.completeness, NameCompleteness::Complete);
        assert_eq!(payload.display_name.as_deref(), Some("Display Label"));
        assert_eq!(payload.name.given_name.as_deref(), Some("Morgan"));
        assert_eq!(payload.name.additional_names.as_deref(), Some("Lee"));
        assert_eq!(payload.name.family_name.as_deref(), Some("Vale"));
        assert_eq!(payload.name.name_prefix.as_deref(), Some("Dr."));
        assert_eq!(payload.name.name_suffix.as_deref(), Some("Jr."));
    }
}

#[test]
fn display_labels_and_given_only_never_qualify_as_complete_names() {
    for (format, bytes) in [
        (FileFormat::GoogleCsv, "Name\nMorgan Vale\n"),
        (
            FileFormat::GoogleCsv,
            "Name,Given Name\nDisplay Label,Morgan Vale\n",
        ),
        (
            FileFormat::Vcard,
            "BEGIN:VCARD\nVERSION:3.0\nFN:Morgan Vale\nEND:VCARD\n",
        ),
        (
            FileFormat::Vcard,
            "BEGIN:VCARD\nVERSION:3.0\nFN:Display Label\nN:;Morgan Vale;;;\nEND:VCARD\n",
        ),
    ] {
        let input = parse_stage_input(
            "fictional-account".into(),
            "contacts".into(),
            bytes.as_bytes(),
            format,
            FileEncoding::Utf8,
        )
        .unwrap();
        assert_eq!(input.rows.len(), 1);
        assert!(input.rows[0].errors.is_empty());
        let payload = input.rows[0].payload.as_ref().unwrap();
        assert_eq!(payload.name.completeness, NameCompleteness::Unknown);
        assert!(payload.name.family_name.is_none());
        assert!(payload.display_name.is_some());
    }
}
