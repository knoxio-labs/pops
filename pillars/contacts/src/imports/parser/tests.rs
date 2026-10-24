use super::*;

fn csv(text: &str) -> ParseResult {
    parse_file(text.as_bytes(), FileFormat::GoogleCsv, FileEncoding::Utf8).unwrap()
}

fn vcard(text: &str) -> ParseResult {
    parse_file(text.as_bytes(), FileFormat::Vcard, FileEncoding::Utf8).unwrap()
}

#[test]
fn google_csv_retains_unicode_quotes_newlines_and_multiple_points() {
    let result = csv("Name,Given Name,Family Name,E-mail 1 - Type,E-mail 1 - Value,E-mail 2 - Value,Phone 1 - Value,Website 1 - Value\r\n\"Zoë, Q\"\"\nExample\",Zoë,Example,Home,ZoE@Example.test,second@example.test,+61 400 000 001,https://example.test/zoe\r\n");
    assert!(result.errors.is_empty());
    let contact = &result.contacts[0];
    assert_eq!(contact.record_id, "csv:1");
    assert_eq!(contact.display_name.as_deref(), Some("Zoë, Q\"\nExample"));
    assert_eq!(contact.structured_name.as_ref().unwrap().given, "Zoë");
    assert_eq!(contact.emails.len(), 2);
    assert_eq!(contact.emails[0].value, "ZoE@Example.test");
    assert_eq!(contact.emails[0].label.as_deref(), Some("Home"));
    assert_eq!(contact.phones[0].value, "+61 400 000 001");
    assert_eq!(contact.urls[0].value, "https://example.test/zoe");
}

#[test]
fn csv_display_names_and_shared_first_names_never_merge_or_become_structured() {
    let result = csv("Name\nAlex\nAlex\n");
    assert_eq!(result.contacts.len(), 2);
    assert!(result
        .contacts
        .iter()
        .all(|contact| contact.structured_name.is_none()));
    assert_ne!(result.contacts[0].record_id, result.contacts[1].record_id);
}

#[test]
fn csv_retains_bad_row_errors_and_continues_with_original_ordinals() {
    let result = csv("Name,Given Name\nOne,One\nmalformed\nTwo,Two\n,\n");
    assert_eq!(result.contacts.len(), 2);
    assert_eq!(result.contacts[1].record_id, "csv:3");
    assert_eq!(result.errors[0].record_id, "csv:2");
    assert_eq!(result.errors[1].record_id, "csv:4");
}

#[test]
fn csv_rejects_permissively_decoded_broken_quotes() {
    for row in ["\"Unclosed", "Unquoted\"quote", "\"Closed\"trailing"] {
        let result = csv(&format!("Name\n{row}\n"));
        assert!(result.contacts.is_empty(), "{row}");
        assert_eq!(result.errors.len(), 1, "{row}");
    }
}

#[test]
fn modern_google_csv_labels_and_email_spelling_are_supported() {
    let result = csv(
        "First Name,Last Name,Email 1 - Label,Email 1 - Value\nZoë,Example,Work,zoe@example.test\n",
    );
    assert_eq!(result.contacts[0].emails[0].label.as_deref(), Some("Work"));
    assert_eq!(
        result.contacts[0].structured_name.as_ref().unwrap().family,
        "Example"
    );
}

#[test]
fn csv_rejects_unknown_duplicate_and_oversized_headers() {
    for text in [
        "Unrelated\nvalue\n".to_owned(),
        "Name,Name\na,b\n".to_owned(),
        format!("Name,{}\na,b\n", "x".repeat(MAX_FIELD_BYTES + 1)),
    ] {
        assert!(parse_file(text.as_bytes(), FileFormat::GoogleCsv, FileEncoding::Utf8).is_err());
    }
}

#[test]
fn explicitly_selected_unicode_encodings_decode_without_loss() {
    let text = "Name\r\nZoë Example\r\n";
    for (encoding, little_endian) in [
        (FileEncoding::Utf16Le, true),
        (FileEncoding::Utf16Be, false),
    ] {
        let bytes: Vec<u8> = text
            .encode_utf16()
            .flat_map(|unit| {
                if little_endian {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                }
            })
            .collect();
        let result = parse_file(&bytes, FileFormat::GoogleCsv, encoding).unwrap();
        assert_eq!(
            result.contacts[0].display_name.as_deref(),
            Some("Zoë Example")
        );
    }
    let result = parse_file(
        b"Name\nZo\xeb Example\n",
        FileFormat::GoogleCsv,
        FileEncoding::Windows1252,
    )
    .unwrap();
    assert_eq!(
        result.contacts[0].display_name.as_deref(),
        Some("Zoë Example")
    );
    let result = csv("\u{feff}Name\nZoë Example\n");
    assert_eq!(
        result.contacts[0].display_name.as_deref(),
        Some("Zoë Example")
    );
}

#[test]
fn invalid_encoding_is_not_replaced_or_guessed() {
    assert!(parse_file(b"Name\n\xff", FileFormat::GoogleCsv, FileEncoding::Utf8).is_err());
    assert!(parse_file(&[0x00, 0xd8], FileFormat::GoogleCsv, FileEncoding::Utf16Le).is_err());
}

#[test]
fn vcard_unfolds_decodes_text_and_retains_uid_and_all_points() {
    let result = vcard("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ex\r\n ample\r\nN:Ex\\;ample;Zoë;;;\r\nUID:contact-17\r\nEMAIL;TYPE=home:ZoE@example.test\r\nEMAIL;TYPE=work:work@example.test\r\nTEL;TYPE=cell:tel:+61400000001\r\nURL:https://example.test/zoe\r\nX-SOCIALPROFILE;TYPE=mastodon:https://social.example/@zoe\r\nEND:VCARD\r\n");
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    let contact = &result.contacts[0];
    assert_eq!(contact.display_name.as_deref(), Some("Zoë Example"));
    assert_eq!(contact.structured_name.as_ref().unwrap().family, "Ex;ample");
    assert_eq!(contact.uid.as_deref(), Some("contact-17"));
    assert_eq!(contact.emails.len(), 2);
    assert_eq!(contact.emails[0].value, "ZoE@example.test");
    assert_eq!(contact.phones[0].value, "tel:+61400000001");
    assert_eq!(contact.urls.len(), 2);
    assert_eq!(contact.urls[1].label.as_deref(), Some("mastodon"));
}

#[test]
fn vcard_recovers_after_invalid_and_unclosed_cards() {
    let result = vcard("BEGIN:VCARD\nVERSION:4.0\nmalformed\nEND:VCARD\nBEGIN:VCARD\nVERSION:4.0\nFN:Unclosed\nBEGIN:VCARD\nVERSION:3.0\nFN:Survives\nEND:VCARD\n");
    assert_eq!(result.errors.len(), 2);
    assert_eq!(result.contacts.len(), 1);
    assert_eq!(result.contacts[0].record_id, "vcard:3");
    assert_eq!(result.contacts[0].display_name.as_deref(), Some("Survives"));
}

#[test]
fn vcard_rejects_unsupported_versions_encodings_and_invalid_names() {
    for body in [
        "VERSION:2.1\nFN:Example",
        "VERSION:4.0\nFN;ENCODING=QUOTED-PRINTABLE:Example",
        "VERSION:4.0\nFN;CHARSET=ISO-8859-1:Example",
        "VERSION:4.0\nN:Only;Two",
        "VERSION:4.0\nFN:Bad\\q",
        "VERSION:4.0\nUID:a",
        "VERSION:4.0\nFN:A\nUID:a\nUID:b",
    ] {
        let result = vcard(&format!("BEGIN:VCARD\n{body}\nEND:VCARD\n"));
        assert_eq!(result.errors.len(), 1, "{body}");
        assert!(result.contacts.is_empty(), "{body}");
    }
}

#[test]
fn vcard_records_trailing_and_outside_content_errors() {
    let result = vcard("unframed\nBEGIN:VCARD\nVERSION:4.0\nFN:Valid\nEND:VCARD\nBEGIN:VCARD\nVERSION:4.0\nFN:Trailing\n");
    assert_eq!(result.contacts.len(), 1);
    assert_eq!(result.errors.len(), 2);
    assert!(parse_file(b"not a card", FileFormat::Vcard, FileEncoding::Utf8).is_err());
}

#[test]
fn vcard_preserves_trailing_spaces_fold_spaces_and_uri_colons() {
    let result = vcard("BEGIN:VCARD\nVERSION:4.0\nFN: Example \n continued \nEMAIL;TYPE=\"custom:label\":ZoE@example.test \nURL::custom\nPHOTO;ENCODING=b:ignored\nEND:VCARD\n");
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    assert_eq!(
        result.contacts[0].display_name.as_deref(),
        Some(" Example continued ")
    );
    assert_eq!(result.contacts[0].emails[0].value, "ZoE@example.test ");
    assert_eq!(result.contacts[0].urls[0].value, ":custom");
}

#[test]
fn vcard_ignores_large_folded_photo_without_discarding_contact() {
    let photo = format!(
        "PHOTO;ENCODING=b:{}\n",
        format!("{}\n ", "A".repeat(75)).repeat(1000)
    );
    let result = vcard(&format!(
        "BEGIN:VCARD\nVERSION:3.0\nFN:Photo Example\n{photo}EMAIL:photo@example.test\nEND:VCARD\n"
    ));
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    assert_eq!(result.contacts.len(), 1);
    assert_eq!(
        result.contacts[0].display_name.as_deref(),
        Some("Photo Example")
    );
    assert_eq!(result.contacts[0].emails[0].value, "photo@example.test");
}

#[test]
fn vcard_retains_all_repeated_and_list_type_labels_in_source_order() {
    let result = vcard("BEGIN:VCARD\nVERSION:3.0\nFN:Labels Example\nEMAIL;type=INTERNET;type=HOME;type=pref:labels@example.test\nTEL;TYPE=CELL,VOICE;TYPE=PREF:+61400000001\nEND:VCARD\n");
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    assert_eq!(
        result.contacts[0].emails[0].label.as_deref(),
        Some("INTERNET,HOME,pref")
    );
    assert_eq!(
        result.contacts[0].phones[0].label.as_deref(),
        Some("CELL,VOICE,PREF")
    );
}

#[test]
fn field_limits_accept_boundary_and_reject_above_for_both_formats() {
    let accepted = "x".repeat(MAX_FIELD_BYTES);
    let rejected = "x".repeat(MAX_FIELD_BYTES + 1);
    assert_eq!(csv(&format!("Name\n{accepted}\n")).contacts.len(), 1);
    assert_eq!(csv(&format!("Name\n{rejected}\n")).errors.len(), 1);
    assert_eq!(
        vcard(&format!(
            "BEGIN:VCARD\nVERSION:4.0\nFN:{accepted}\nEND:VCARD\n"
        ))
        .contacts
        .len(),
        1
    );
    assert_eq!(
        vcard(&format!(
            "BEGIN:VCARD\nVERSION:4.0\nFN:{rejected}\nEND:VCARD\n"
        ))
        .errors
        .len(),
        1
    );
}

#[test]
fn file_and_record_caps_fail_closed() {
    assert!(parse_file(
        &vec![b'x'; MAX_FILE_BYTES + 1],
        FileFormat::GoogleCsv,
        FileEncoding::Utf8
    )
    .is_err());
    let at_limit = format!("Name\n{}", "Example\n".repeat(MAX_RECORDS));
    assert_eq!(csv(&at_limit).contacts.len(), MAX_RECORDS);
    assert!(parse_file(
        format!("{at_limit}Extra\n").as_bytes(),
        FileFormat::GoogleCsv,
        FileEncoding::Utf8
    )
    .is_err());
    let card = "BEGIN:VCARD\nVERSION:4.0\nFN:Example\nEND:VCARD\n";
    assert_eq!(vcard(&card.repeat(MAX_RECORDS)).contacts.len(), MAX_RECORDS);
    assert!(parse_file(
        card.repeat(MAX_RECORDS + 1).as_bytes(),
        FileFormat::Vcard,
        FileEncoding::Utf8
    )
    .is_err());
}
