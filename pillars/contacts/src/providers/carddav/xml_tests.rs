use super::tests::*;
use super::*;

#[test]
fn xml_requires_expanded_names_and_rejects_ambiguous_fields() {
    let spoof = "<d:multistatus xmlns:d=\"urn:spoof\"/>";
    assert!(xml::parse(spoof.as_bytes()).is_err());
    let duplicated = multi(
        "<d:response><d:href>/one</d:href><d:href>/two</d:href></d:response>",
        None,
    );
    assert!(xml::parse(duplicated.as_bytes()).is_err());
    let wrong_namespace = "<d:multistatus xmlns:d=\"DAV:\" xmlns:x=\"urn:spoof\"><x:response><x:href>/ignored</x:href></x:response></d:multistatus>";
    assert!(xml::parse(wrong_namespace.as_bytes()).is_err());
}

#[test]
fn xml_rejects_dtd_entities_unclosed_trees_and_excess_namespace_bindings() {
    for text in ["<!DOCTYPE multistatus [<!ENTITY leak SYSTEM 'file:///fictional'>]><d:multistatus xmlns:d='DAV:'>&leak;</d:multistatus>".to_owned(), "<d:multistatus xmlns:d='DAV:'>".to_owned(), format!("<d:multistatus xmlns:d='DAV:' {} />", (0..33).map(|index| format!("xmlns:n{index}='urn:{index}'")).collect::<Vec<_>>().join(" ")), "<d:multistatus xmlns:d='DAV:'>&unknown;</d:multistatus>".to_owned()] {
        assert!(xml::parse(text.as_bytes()).is_err());
    }
}

#[test]
fn xml_bounds_body_depth_and_tokens() {
    assert!(matches!(
        xml::parse(&vec![b'x'; 4 * 1024 * 1024 + 1]),
        Err(CardDavError::ResponseLimit)
    ));
    let deep = format!(
        "<d:multistatus xmlns:d='DAV:'>{}{}</d:multistatus>",
        "<d:n>".repeat(32),
        "</d:n>".repeat(32)
    );
    assert!(matches!(
        xml::parse(deep.as_bytes()),
        Err(CardDavError::ResponseLimit)
    ));
    assert!(xml::parse(multi("", Some(&"x".repeat(4097))).as_bytes()).is_err());
}

#[test]
fn xml_retains_cdata_entities_and_property_failure_statuses() {
    let content = multi(&properties(ONE, "<d:getetag>&quot;v1&amp;v2&quot;</d:getetag><c:address-data><![CDATA[BEGIN:VCARD\nFN:A & B\nEND:VCARD]]></c:address-data>").replace("200 OK", "404 Missing"), Some("urn:fictional:a&amp;b"));
    let parsed = xml::parse(content.as_bytes()).unwrap();
    assert_eq!(parsed.responses[0].properties[0].0, 404);
    assert_eq!(
        parsed.responses[0].properties[0].1.etag.as_deref(),
        Some("\"v1&v2\"")
    );
    assert_eq!(
        parsed.responses[0].properties[0].1.card.as_deref(),
        Some("BEGIN:VCARD\nFN:A & B\nEND:VCARD")
    );
    assert_eq!(parsed.token.as_deref(), Some("urn:fictional:a&amp;b"));
}
