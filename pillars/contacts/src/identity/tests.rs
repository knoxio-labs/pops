use super::*;

fn record(id: &str, given: &str, family: &str, email: &str, phone: &str) -> IdentityRecord {
    IdentityRecord {
        id: id.to_owned(),
        source: None,
        emails: NormalizedEmail::new(email).into_iter().collect(),
        phones: E164Phone::new(phone).into_iter().collect(),
        name: NameEvidence {
            display_name: None,
            complete_name: CompleteName::new(given, family),
        },
    }
}

fn candidate(id: &str, record: IdentityRecord) -> IdentityCandidate {
    IdentityCandidate {
        entity_id: id.to_owned(),
        origin: CandidateOrigin::Existing,
        member_ids: Vec::new(),
        records: vec![record],
    }
}

fn expected_review(reason: ReviewReason, ids: &[&str]) -> IdentityOutcome {
    IdentityOutcome::Review {
        reason,
        candidates: ids.iter().map(|id| (*id).to_owned()).collect(),
    }
}

#[test]
fn exact_unique_contact_identifiers_match_without_names() {
    for (email, phone, reason) in [
        ("a@example.com", "", MatchReason::Email),
        ("", "+61412345678", MatchReason::Phone),
    ] {
        let incoming = record("incoming", "", "", email, phone);
        assert_eq!(
            classify(
                &incoming,
                &[candidate(
                    "person",
                    record("existing", "", "", email, phone)
                )],
                &[]
            ),
            IdentityOutcome::AutoMatch {
                entity_id: "person".into(),
                reason
            }
        );
    }
}

#[test]
fn blank_and_invalid_identifiers_cannot_match() {
    let incoming = record("incoming", " ", "", "", "0412345678");
    assert_eq!(
        classify(
            &incoming,
            &[candidate("person", record("existing", "", "", "", ""))],
            &[]
        ),
        IdentityOutcome::New
    );
    assert_eq!(NormalizedEmail::new(" a@EXAMPLE.COM "), None);
    assert_eq!(E164Phone::new("+61 412 345 678"), None);
    assert_eq!(CompleteName::new("Jane", "  "), None);
    assert_eq!(SourceIdentity::new("provider", " "), None);
}

#[test]
fn incomplete_and_display_names_always_require_review() {
    for name in ["Jane", "Jane Doe"] {
        let mut incoming = record("incoming", "", "", "", "");
        incoming.name.display_name = Some(name.into());
        let mut existing = incoming.clone();
        existing.id = "existing".into();
        assert_eq!(
            classify(&incoming, &[candidate("person", existing)], &[]),
            expected_review(ReviewReason::IncompleteName, &["person"])
        );
    }
}

#[test]
fn first_names_do_not_disqualify_valid_email_or_phone_evidence() {
    for (email, phone, reason) in [
        ("a@example.com", "", MatchReason::Email),
        ("", "+61412345678", MatchReason::Phone),
    ] {
        let mut incoming = record("incoming", "", "", email, phone);
        incoming.name.display_name = Some("Jane".into());
        let mut existing = record("existing", "", "", email, phone);
        existing.name.display_name = Some("Janet".into());
        assert_eq!(
            classify(&incoming, &[candidate("person", existing)], &[]),
            IdentityOutcome::AutoMatch {
                entity_id: "person".into(),
                reason
            }
        );
    }
}

#[test]
fn unique_complete_names_require_complete_evidence_on_both_sides() {
    let incoming = record("incoming", "José", "Silva", "", "");
    assert_eq!(
        classify(
            &incoming,
            &[candidate(
                "person",
                record("existing", "JOSE\u{301}", "SILVA", "", "")
            )],
            &[]
        ),
        IdentityOutcome::AutoMatch {
            entity_id: "person".into(),
            reason: MatchReason::CompleteName
        }
    );
    assert_eq!(
        classify(
            &incoming,
            &[candidate(
                "person",
                record("existing", "Jose", "Silva", "", "")
            )],
            &[]
        ),
        IdentityOutcome::New
    );
    let mut existing = record("existing", "", "", "", "");
    existing.name.display_name = Some("José Silva".into());
    assert_eq!(
        classify(&incoming, &[candidate("person", existing)], &[]),
        expected_review(ReviewReason::IncompleteName, &["person"])
    );
}

#[test]
fn complete_names_preserve_component_boundaries_and_additional_names() {
    assert_ne!(
        CompleteName::new("Jane Ann", "Doe"),
        CompleteName::new("Jane", "Ann Doe")
    );
    assert_ne!(
        CompleteName::with_parts("Jane", "Ann", "Doe", ""),
        CompleteName::with_parts("Jane", "Anne", "Doe", "")
    );
    assert_ne!(
        CompleteName::with_parts("John", "", "Doe", "Jr"),
        CompleteName::with_parts("John", "", "Doe", "Sr")
    );
}

#[test]
fn homonyms_and_unknown_completeness_make_name_matching_ambiguous() {
    let incoming = record("incoming", "Jane", "Doe", "", "");
    let existing = record("existing", "Jane", "Doe", "", "");
    let mut other = existing.clone();
    other.id = "other".into();
    for complete in [true, false] {
        if !complete {
            other.name.complete_name = None;
            other.name.display_name = Some("Jane Doe".into());
        }
        let candidates = [
            candidate("z", existing.clone()),
            candidate("a", other.clone()),
        ];
        assert_eq!(
            classify(&incoming, &candidates, &[]),
            expected_review(ReviewReason::AmbiguousName, &["a", "z"])
        );
    }
}

#[test]
fn shared_phone_or_email_blocks_even_an_otherwise_unique_identifier() {
    for phone_shared in [false, true] {
        let incoming = record("incoming", "", "", "a@example.com", "+61412345678");
        let first = record("first", "", "", "a@example.com", "+61412345678");
        let second = if phone_shared {
            record("second", "", "", "b@example.com", "+61412345678")
        } else {
            record("second", "", "", "a@example.com", "+61498765432")
        };
        assert_eq!(
            classify(
                &incoming,
                &[candidate("z", first), candidate("a", second)],
                &[]
            ),
            expected_review(ReviewReason::SharedIdentifier, &["a", "z"])
        );
    }
}

#[test]
fn different_identifiers_resolving_to_different_people_require_review() {
    let incoming = record("incoming", "", "", "a@example.com", "+61412345678");
    let candidates = [
        candidate("email", record("one", "", "", "a@example.com", "")),
        candidate("phone", record("two", "", "", "", "+61412345678")),
    ];
    assert_eq!(
        classify(&incoming, &candidates, &[]),
        expected_review(ReviewReason::ConflictingSignals, &["email", "phone"])
    );
}

#[test]
fn recognized_sources_bypass_guesses_but_never_choose_between_bindings() {
    let mut incoming = record("incoming", "", "", "a@example.com", "");
    incoming.source = SourceIdentity::new("provider", "stable-key");
    let mut existing = record("existing", "", "", "b@example.com", "");
    existing.source = incoming.source.clone();
    let mut candidates = vec![
        candidate("bound", existing.clone()),
        candidate("guess", record("other", "", "", "a@example.com", "")),
    ];
    assert_eq!(
        classify(&incoming, &candidates, &[]),
        IdentityOutcome::RecognizedSource {
            entity_id: "bound".into()
        }
    );
    existing.id = "duplicate".into();
    candidates.push(candidate("duplicate", existing));
    assert_eq!(
        classify(&incoming, &candidates, &[]),
        expected_review(
            ReviewReason::ConflictingSourceBindings,
            &["bound", "duplicate"]
        )
    );
}

#[test]
fn source_keys_are_scoped_to_provider_and_case_sensitive() {
    let mut incoming = record("incoming", "", "", "", "");
    incoming.source = SourceIdentity::new("provider", "KEY");
    for (provider, key) in [("other", "KEY"), ("provider", "key")] {
        let mut existing = record("existing", "", "", "", "");
        existing.source = SourceIdentity::new(provider, key);
        assert_eq!(
            classify(&incoming, &[candidate("person", existing)], &[]),
            IdentityOutcome::New
        );
    }
}

#[test]
fn existing_source_binding_survives_same_id_while_batch_self_is_excluded() {
    let mut incoming = record("stable-id", "", "", "a@example.com", "");
    incoming.source = SourceIdentity::new("provider", "stable-key");
    let mut existing = candidate("person", incoming.clone());
    assert_eq!(
        classify(&incoming, &[existing.clone()], &[]),
        IdentityOutcome::RecognizedSource {
            entity_id: "person".into()
        }
    );
    existing.origin = CandidateOrigin::Batch;
    assert_eq!(classify(&incoming, &[existing], &[]), IdentityOutcome::New);
}

#[test]
fn local_email_case_and_unicode_changes_never_create_automatic_matches() {
    let incoming = record("incoming", "", "", "É@example.com", "");
    for email in ["é@example.com", "E\u{301}@example.com", "E@example.com"] {
        assert_eq!(
            classify(
                &incoming,
                &[candidate("person", record("existing", "", "", email, ""))],
                &[]
            ),
            IdentityOutcome::New
        );
    }
}

#[test]
fn repeated_batch_source_keys_cannot_impersonate_persisted_bindings() {
    let mut incoming = record("incoming", "", "", "", "");
    incoming.source = SourceIdentity::new("provider", "stable-key");
    let mut other = incoming.clone();
    other.id = "other".into();
    let mut batch_candidate = candidate("batch-other", other);
    batch_candidate.origin = CandidateOrigin::Batch;
    assert_eq!(
        classify(&incoming, &[batch_candidate.clone()], &[]),
        expected_review(ReviewReason::BatchCollision, &["batch-other"])
    );
    let existing = candidate("person", incoming.clone());
    assert_eq!(
        classify(&incoming, &[existing, batch_candidate], &[]),
        IdentityOutcome::RecognizedSource {
            entity_id: "person".into()
        }
    );
}

#[test]
fn batch_bridge_is_never_automatically_merged_from_either_end() {
    let left = record("left", "", "", "a@example.com", "");
    let bridge = record("bridge", "", "", "a@example.com", "+61412345678");
    let right = record("right", "", "", "", "+61412345678");
    let mut candidates = [
        candidate("left", left.clone()),
        candidate("bridge", bridge.clone()),
        candidate("right", right.clone()),
    ];
    for candidate in &mut candidates {
        candidate.origin = CandidateOrigin::Batch;
    }
    assert_eq!(
        classify(&left, &candidates, &[]),
        expected_review(ReviewReason::BatchCollision, &["bridge", "right"])
    );
    assert_eq!(
        classify(&right, &candidates, &[]),
        expected_review(ReviewReason::BatchCollision, &["bridge", "left"])
    );
    assert_eq!(
        classify(&bridge, &candidates, &[]),
        expected_review(ReviewReason::ConflictingSignals, &["left", "right"])
    );
}

#[test]
fn rejections_cover_historical_members_on_both_sides_symmetrically() {
    let incoming = record("incoming", "", "", "a@example.com", "");
    let mut target = candidate("target", record("existing", "", "", "a@example.com", ""));
    target.member_ids.push("old-target".into());
    let mut own_group = candidate("own-group", incoming.clone());
    own_group.origin = CandidateOrigin::Batch;
    own_group.member_ids.push("old-incoming".into());
    for (left, right) in [
        ("old-target", "old-incoming"),
        ("old-incoming", "old-target"),
        ("incoming", "target"),
    ] {
        assert_eq!(
            classify(
                &incoming,
                &[target.clone(), own_group.clone()],
                &[KeepSeparate {
                    left_id: left.into(),
                    right_id: right.into()
                }]
            ),
            expected_review(ReviewReason::KeepSeparate, &["target"])
        );
    }
}

#[test]
fn repeated_observations_in_one_group_do_not_create_ambiguity() {
    let incoming = record("incoming", "", "", "a@example.com", "");
    let first = candidate("person", record("first", "", "", "a@example.com", ""));
    let second = candidate("person", record("second", "", "", "a@example.com", ""));
    assert_eq!(
        classify(&incoming, &[first, second], &[]),
        IdentityOutcome::AutoMatch {
            entity_id: "person".into(),
            reason: MatchReason::Email
        }
    );
}

#[test]
fn rejections_follow_incoming_entity_members_without_a_matching_observation_id() {
    let incoming = record("incoming-entity", "", "", "a@example.com", "");
    let mut own_group = candidate(
        "incoming-entity",
        record("prior-observation", "", "", "", ""),
    );
    own_group.member_ids.push("prior-member".into());
    let target = candidate("target", record("existing", "", "", "a@example.com", ""));
    assert_eq!(
        classify(
            &incoming,
            &[own_group, target],
            &[KeepSeparate {
                left_id: "prior-member".into(),
                right_id: "target".into()
            }]
        ),
        expected_review(ReviewReason::KeepSeparate, &["target"])
    );
}

#[test]
fn signal_evidence_reports_all_exact_reasons_without_deciding_uniqueness() {
    let left = record("left", "Jane", "Doe", "jane@example.test", "+61412345678");
    let right = record("right", "Jane", "Doe", "jane@example.test", "+61412345678");
    assert_eq!(
        matching_signals(&left, &right)
            .into_iter()
            .collect::<Vec<_>>(),
        vec![
            MatchReason::Email,
            MatchReason::Phone,
            MatchReason::CompleteName
        ]
    );
}

#[test]
fn ingested_observations_exclude_own_group_but_preserve_its_historical_rejections() {
    let incoming = record("own", "Jane", "Doe", "jane@example.test", "");
    let mut own = candidate("own", incoming.clone());
    own.member_ids.push("prior-own".into());
    let other = candidate(
        "other",
        record("existing", "Jane", "Doe", "jane@example.test", ""),
    );
    let candidates = [own, other];
    assert_eq!(
        classify_after_ingestion(&incoming, &candidates, &[]),
        IdentityOutcome::AutoMatch {
            entity_id: "other".into(),
            reason: MatchReason::Email
        }
    );
    assert_eq!(
        classify_after_ingestion(
            &incoming,
            &candidates,
            &[KeepSeparate {
                left_id: "prior-own".into(),
                right_id: "other".into()
            }]
        ),
        expected_review(ReviewReason::KeepSeparate, &["other"])
    );
}

#[test]
fn display_only_names_can_review_a_different_display_with_matching_structured_name() {
    let incoming = record("incoming", "", "", "", "");
    let incoming = IdentityRecord {
        name: NameEvidence {
            display_name: Some("Jane Doe".into()),
            complete_name: None,
        },
        ..incoming
    };
    let mut existing = record("existing", "Jane", "Doe", "", "");
    existing.name.display_name = Some("Different preferred label".into());
    assert_eq!(
        classify(&incoming, &[candidate("target", existing)], &[]),
        expected_review(ReviewReason::IncompleteName, &["target"])
    );
}
