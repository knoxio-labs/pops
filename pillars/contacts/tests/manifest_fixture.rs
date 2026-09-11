//! Cross-language drift check for the hand-written contacts manifest
//! (POPS-2592).
//!
//! `manifest.rs` builds `ManifestPayload` as a `serde_json::Value` because
//! Rust cannot import the TS `ManifestPayloadSchema` (`libs/sdk/src/
//! manifest-schema/schema.ts`) that core actually runs on register — the same
//! mirror-across-a-language-boundary defect ADR-049 removed on the TS side by
//! declaring the shape once, which is not an option here. Nothing short of
//! a second language can read Rust output, so the check is a shared fixture
//! instead of a shared type: this test pins what the Rust build currently
//! emits, and `scripts/ci/__tests__/check-contacts-manifest-fixture.test.ts`
//! parses the SAME committed file with the real Zod schema. Together they
//! prove the built manifest is schema-shaped without either language
//! depending on the other.
//!
//! `UPDATE_MANIFEST_FIXTURE=1 cargo test -p contacts --test manifest_fixture`
//! rewrites the fixture instead of comparing — the only way to change it
//! deliberately. A plain `cargo test` compares and fails with a message naming
//! that variable when the two disagree.
//!
//! The comparison is on parsed JSON, not bytes, so the repository formatter
//! owns the file's layout and no formatter exemption is needed for it.

use std::fs;
use std::path::PathBuf;

use contacts::manifest::build_contacts_manifest;

/// A fixed version, not whatever `Config::from_env` would coerce from the
/// environment at boot — the fixture must be reproducible on every machine
/// and every CI run, and `build_contacts_manifest` takes the already-coerced
/// version as a plain argument, so there is no env-reading path inside it to
/// route around.
const FIXTURE_VERSION: &str = "0.0.0-dev";

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/manifest.json")
}

#[test]
fn manifest_matches_committed_fixture() {
    let manifest = build_contacts_manifest(FIXTURE_VERSION);
    let mut rendered = serde_json::to_string_pretty(&manifest)
        .expect("build_contacts_manifest always returns serialisable JSON");
    rendered.push('\n');

    let path = fixture_path();

    if std::env::var("UPDATE_MANIFEST_FIXTURE").as_deref() == Ok("1") {
        fs::write(&path, &rendered)
            .unwrap_or_else(|err| panic!("failed to write {}: {err}", path.display()));
        return;
    }

    let committed = fs::read_to_string(&path).unwrap_or_else(|err| {
        panic!(
            "failed to read {}: {err}\n\
             run `UPDATE_MANIFEST_FIXTURE=1 cargo test -p contacts --test manifest_fixture` \
             to create it",
            path.display()
        )
    });

    let committed: serde_json::Value = serde_json::from_str(&committed)
        .unwrap_or_else(|err| panic!("{} is not valid JSON: {err}", path.display()));

    assert_eq!(
        committed, manifest,
        "pillars/contacts/tests/fixtures/manifest.json no longer matches \
         build_contacts_manifest({FIXTURE_VERSION:?}).\n\
         If this change is deliberate, regenerate the fixture with:\n\
         \n    UPDATE_MANIFEST_FIXTURE=1 cargo test -p contacts --test manifest_fixture\n\
         \n\
         and re-run `pnpm exec vitest run scripts/ci/__tests__/check-contacts-manifest-fixture.test.ts` \
         to confirm the Node side still accepts it against ManifestPayloadSchema."
    );
}
