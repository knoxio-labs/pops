use super::tests::*;
use super::*;
use crate::providers::sync::PageProgress;
use std::collections::BTreeMap;

#[tokio::test]
async fn full_sync_fetches_only_changed_etags_and_retains_all_seen_members() {
    let listing = multi(
        &format!("{}{}", listed(ONE, "\"one\""), listed(TWO, "\"same\"")),
        Some("urn:fictional:final"),
    );
    let fake = Fake::new(vec![
        Step::xml("REPORT", BOOK, 207, &listing).containing("<d:sync-token></d:sync-token>"),
        Step::xml(
            "REPORT",
            BOOK,
            207,
            &multi(&card(ONE, "\"one\"", "fictional-one"), None),
        )
        .containing(ONE)
        .excluding(TWO),
    ]);
    let known = BTreeMap::from([(TWO.to_owned(), "\"same\"".to_owned())]);
    let page = CardDavAdapter::new(fake.clone())
        .sync_page(&authorization(), &book(), None, None, &known)
        .await
        .unwrap();
    assert_eq!(page.seen_record_keys, vec![ONE, TWO]);
    assert_eq!(page.changes.len(), 1);
    assert_eq!(page.changes[0].row.record_key, ONE);
    assert_eq!(page.changes[0].uid.as_deref(), Some("fictional-one"));
    assert_eq!(page.changes[0].etag.as_deref(), Some("\"one\""));
    assert!(!page.changes[0].row.removed);
    assert!(page.changes[0].row.payload.is_some());
    assert!(
        matches!(page.progress, PageProgress::Complete { checkpoint: Some(token) } if token == "urn:fictional:final")
    );
    fake.done();
}

#[tokio::test]
async fn incremental_removal_uses_only_scoped_resource_identity() {
    let fake = Fake::new(vec![Step::xml(
        "REPORT",
        BOOK,
        207,
        &multi(&status(ONE, 404), Some("urn:fictional:next")),
    )
    .containing("urn:fictional:old")]);
    let page = CardDavAdapter::new(fake.clone())
        .sync_page(
            &authorization(),
            &book(),
            Some("urn:fictional:old"),
            None,
            &BTreeMap::new(),
        )
        .await
        .unwrap();
    assert_eq!(page.changes.len(), 1);
    assert_eq!(page.changes[0].row.record_key, ONE);
    assert!(page.changes[0].row.removed);
    assert!(page.changes[0].row.payload.is_none());
    assert!(page.seen_record_keys.is_empty());
    fake.done();
}

#[tokio::test]
async fn truncated_full_scan_can_restart_from_durable_cursor_after_failure() {
    let first = multi(
        &format!("{}{}", listed(ONE, "one"), status(BOOK, 507)),
        Some("urn:fictional:partial"),
    );
    let fake = Fake::new(vec![
        Step::xml("REPORT", BOOK, 207, &first),
        Step::xml(
            "REPORT",
            BOOK,
            207,
            &multi(&card(ONE, "one", "fictional-one"), None),
        ),
    ]);
    let page = CardDavAdapter::new(fake.clone())
        .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
        .await
        .unwrap();
    let PageProgress::Continue { cursor } = page.progress else {
        panic!("partial scan advanced checkpoint");
    };
    fake.done();
    let failed = Fake::new(vec![Step::failed(BOOK)]);
    assert!(matches!(
        CardDavAdapter::new(failed.clone())
            .sync_page(
                &authorization(),
                &book(),
                None,
                Some(&cursor),
                &BTreeMap::new()
            )
            .await,
        Err(CardDavError::Transport)
    ));
    failed.done();
    let restarted = Fake::new(vec![Step::xml(
        "REPORT",
        BOOK,
        207,
        &multi(&status(ONE, 404), Some("urn:fictional:final")),
    )
    .containing("urn:fictional:partial")]);
    let page = CardDavAdapter::new(restarted.clone())
        .sync_page(
            &authorization(),
            &book(),
            None,
            Some(&cursor),
            &BTreeMap::new(),
        )
        .await
        .unwrap();
    assert!(page.changes[0].row.removed);
    assert!(page.seen_record_keys.is_empty());
    assert!(
        matches!(page.progress, PageProgress::Complete { checkpoint: Some(token) } if token == "urn:fictional:final")
    );
    restarted.done();
}

#[tokio::test]
async fn continuation_is_bound_to_collection_and_initial_checkpoint() {
    for cursor in [format!("{{\"collection\":\"{BOOK}\",\"checkpoint\":\"different\",\"token\":\"partial\"}}"), "{\"collection\":\"https://contacts.icloud.com/other/\",\"checkpoint\":null,\"token\":\"partial\"}".to_owned(), "not-json".to_owned()] {
        let fake = Fake::new(Vec::new());
        assert!(matches!(CardDavAdapter::new(fake.clone()).sync_page(&authorization(), &book(), None, Some(&cursor), &BTreeMap::new()).await, Err(CardDavError::MalformedResponse)));
        fake.done();
    }
}

#[tokio::test]
async fn invalid_sync_token_requires_explicit_full_restart() {
    for (body, expected) in [
        (
            "<d:error xmlns:d=\"DAV:\"><d:valid-sync-token/></d:error>",
            CardDavError::ResetRequired,
        ),
        (
            "<d:error xmlns:d=\"urn:spoof\"><d:valid-sync-token/></d:error>",
            CardDavError::Unauthorized,
        ),
    ] {
        let fake = Fake::new(vec![Step::xml("REPORT", BOOK, 403, body)]);
        let result = CardDavAdapter::new(fake.clone())
            .sync_page(
                &authorization(),
                &book(),
                Some("urn:fictional:expired"),
                None,
                &BTreeMap::new(),
            )
            .await;
        assert!(matches!(result, Err(error) if error == expected));
        fake.done();
    }
}

#[tokio::test]
async fn unsupported_report_falls_back_only_during_initial_full_enumeration() {
    let self_entry = properties(BOOK, "<d:resourcetype><d:collection/></d:resourcetype>");
    let fake = Fake::new(vec![
        Step::xml("REPORT", BOOK, 405, ""),
        Step::xml(
            "PROPFIND",
            BOOK,
            207,
            &multi(&format!("{}{}", self_entry, listed(ONE, "one")), None),
        ),
        Step::xml(
            "REPORT",
            BOOK,
            207,
            &multi(&card(ONE, "one", "fictional-one"), None),
        ),
    ]);
    let page = CardDavAdapter::new(fake.clone())
        .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
        .await
        .unwrap();
    assert_eq!(page.seen_record_keys, vec![ONE]);
    assert!(matches!(
        page.progress,
        PageProgress::Complete { checkpoint: None }
    ));
    fake.done();
    let fake = Fake::new(vec![Step::xml("REPORT", BOOK, 405, "")]);
    assert!(matches!(
        CardDavAdapter::new(fake.clone())
            .sync_page(
                &authorization(),
                &book(),
                Some("old"),
                None,
                &BTreeMap::new()
            )
            .await,
        Err(CardDavError::ResetRequired)
    ));
    fake.done();
}

#[tokio::test]
async fn incomplete_fallback_cannot_claim_empty_complete_snapshot() {
    let fake = Fake::new(vec![
        Step::xml("REPORT", BOOK, 501, ""),
        Step::xml("PROPFIND", BOOK, 207, &multi("", None)),
    ]);
    assert!(matches!(
        CardDavAdapter::new(fake.clone())
            .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
            .await,
        Err(CardDavError::MalformedResponse)
    ));
    fake.done();
}

#[tokio::test]
async fn multiget_must_cover_every_requested_member_at_same_etag() {
    for fetched in [
        multi("", None),
        multi(&card(ONE, "changed-during-read", "fictional-one"), None),
        multi(&status(ONE, 404), None),
        multi(&card(TWO, "one", "fictional-other"), None),
    ] {
        let fake = Fake::new(vec![
            Step::xml(
                "REPORT",
                BOOK,
                207,
                &multi(&listed(ONE, "one"), Some("next")),
            ),
            Step::xml("REPORT", BOOK, 207, &fetched),
        ]);
        assert!(CardDavAdapter::new(fake.clone())
            .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
            .await
            .is_err());
        fake.done();
    }
}

#[tokio::test]
async fn malformed_vcard_or_duplicate_uid_aborts_entire_page() {
    let malformed = properties(
        ONE,
        "<d:getetag>one</d:getetag><c:address-data>BEGIN:VCARD</c:address-data>",
    );
    for fetched in [
        malformed,
        format!(
            "{}{}",
            card(ONE, "one", "same-uid"),
            card(TWO, "two", "same-uid")
        ),
    ] {
        let two = fetched.contains(TWO);
        let listing = multi(
            &format!(
                "{}{}",
                listed(ONE, "one"),
                if two {
                    listed(TWO, "two")
                } else {
                    String::new()
                }
            ),
            Some("next"),
        );
        let fake = Fake::new(vec![
            Step::xml("REPORT", BOOK, 207, &listing),
            Step::xml("REPORT", BOOK, 207, &multi(&fetched, None)),
        ]);
        assert!(matches!(
            CardDavAdapter::new(fake.clone())
                .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
                .await,
            Err(CardDavError::MalformedResponse)
        ));
        fake.done();
    }
}

#[tokio::test]
async fn listing_rejects_duplicate_cross_collection_and_stalled_page_members() {
    let cases = [
        multi(
            &format!("{}{}", listed(ONE, "one"), listed(ONE, "one")),
            Some("next"),
        ),
        multi(
            &listed("https://p01-contacts.icloud.com/other/card.vcf", "one"),
            Some("next"),
        ),
        multi(
            &listed(&format!("{BOOK}%2e%2e%2fother.vcf"), "one"),
            Some("next"),
        ),
        multi(
            &format!("{}{}", listed(ONE, "one"), status(BOOK, 507)),
            Some("old"),
        ),
        multi("", None),
    ];
    for listing in cases {
        let fake = Fake::new(vec![Step::xml("REPORT", BOOK, 207, &listing)]);
        assert!(CardDavAdapter::new(fake.clone())
            .sync_page(
                &authorization(),
                &book(),
                Some("old"),
                None,
                &BTreeMap::new()
            )
            .await
            .is_err());
        fake.done();
    }
}

#[tokio::test]
async fn bounded_multiget_splits_large_requested_sets() {
    let mut listing = String::new();
    let mut first = String::new();
    let mut second = String::new();
    for index in 0..101 {
        let href = format!("{BOOK}{index:03}.vcf");
        listing.push_str(&listed(&href, "one"));
        let target = if index < 100 { &mut first } else { &mut second };
        target.push_str(&card(&href, "one", &format!("fictional-{index}")));
    }
    let fake = Fake::new(vec![
        Step::xml("REPORT", BOOK, 207, &multi(&listing, Some("next"))),
        Step::xml("REPORT", BOOK, 207, &multi(&first, None)).excluding("100.vcf"),
        Step::xml("REPORT", BOOK, 207, &multi(&second, None))
            .containing("100.vcf")
            .excluding("099.vcf"),
    ]);
    let page = CardDavAdapter::new(fake.clone())
        .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
        .await
        .unwrap();
    assert_eq!(page.changes.len(), 101);
    fake.done();
    let failed = Fake::new(vec![
        Step::xml("REPORT", BOOK, 207, &multi(&listing, Some("next"))),
        Step::xml("REPORT", BOOK, 207, &multi(&first, None)),
        Step::failed(BOOK),
    ]);
    assert!(matches!(
        CardDavAdapter::new(failed.clone())
            .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
            .await,
        Err(CardDavError::Transport)
    ));
    failed.done();
}

#[tokio::test]
async fn fetched_card_byte_limit_accepts_boundary_and_rejects_above() {
    let prefix = "BEGIN:VCARD\nVERSION:3.0\nFN:Fictional Example\nUID:fictional\nPHOTO:";
    let suffix = "\nEND:VCARD\n";
    for extra in [0, 1] {
        let source = format!(
            "{prefix}{}{suffix}",
            "A".repeat(512 * 1024 - prefix.len() - suffix.len() + extra)
        );
        let fetched = properties(
            ONE,
            &format!(
                "<d:getetag>one</d:getetag><c:address-data>{}</c:address-data>",
                xml_text(&source)
            ),
        );
        let fake = Fake::new(vec![
            Step::xml(
                "REPORT",
                BOOK,
                207,
                &multi(&listed(ONE, "one"), Some("next")),
            ),
            Step::xml("REPORT", BOOK, 207, &multi(&fetched, None)),
        ]);
        let result = CardDavAdapter::new(fake.clone())
            .sync_page(&authorization(), &book(), None, None, &BTreeMap::new())
            .await;
        if extra == 0 {
            assert_eq!(result.unwrap().changes.len(), 1);
        } else {
            assert!(matches!(result, Err(CardDavError::ResponseLimit)));
        }
        fake.done();
    }
}
