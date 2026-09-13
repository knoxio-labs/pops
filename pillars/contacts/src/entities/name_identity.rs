//! What makes two entity names "the same name" for uniqueness purposes.
//!
//! `COLLATE NOCASE`, SQLite's built-in collation, folds ASCII case only —
//! `Padaria` and `PADARIA` collide, as intended, but `São João` and
//! `SÃO JOÃO` do not, because `ã`/`Ã` sit outside ASCII. Receipts keep a
//! merchant's original spelling while card issuers upper-case and often
//! strip accents, so a Brazilian merchant arriving by both routes minted
//! two entities under the old rule.
//!
//! **Decision, written down rather than left to the collation:** two names
//! that differ only by Unicode case, or only by diacritics, are the same
//! name (`São João` == `SÃO JOÃO` == `Sao Joao`). Purchases' own merchant
//! matching (`normalizeMatchDescriptor`) already folds diacritics the same
//! way, via NFKD plus a combining-mark strip — this mirrors that so
//! contacts and purchases agree about identity instead of disagreeing.
//! Non-Latin scripts are a separate, larger question — there is no case to
//! fold and the collision that matters is script against romanisation —
//! and are explicitly out of scope here.
use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Fold `name` to the form two Unicode-case-or-diacritic variants share.
///
/// NFKD decomposes an accented letter into its base letter plus a combining
/// mark (`ã` → `a` + combining tilde); stripping combining marks then
/// discards the accent, and `to_lowercase` folds case using full Unicode
/// case mapping (not ASCII-only), so `SÃO` and `São` and `Sao` all fold to
/// `sao`.
pub fn normalize_for_identity(name: &str) -> String {
    name.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}

/// The name given to the custom SQLite collation registered from this
/// normalisation — the `COLLATE` keyword this pillar's SQL uses wherever a
/// query needs the same identity rule the unique index enforces.
pub const UNICODE_IDENTITY_COLLATION: &str = "UNICODE_NOCASE";

/// The comparator registered as [`UNICODE_IDENTITY_COLLATION`] on every
/// connection (`db::connect`), so `entities.name COLLATE UNICODE_NOCASE`
/// means exactly [`normalize_for_identity`] equality everywhere it appears
/// — the unique index, the create/rename pre-check, and the by-name fetch.
pub fn unicode_identity_collate(a: &str, b: &str) -> std::cmp::Ordering {
    normalize_for_identity(a).cmp(&normalize_for_identity(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_ascii_case_like_the_old_collation_did() {
        assert_eq!(
            normalize_for_identity("Padaria"),
            normalize_for_identity("PADARIA")
        );
    }

    #[test]
    fn folds_unicode_case_the_old_collation_missed() {
        assert_eq!(
            normalize_for_identity("São João"),
            normalize_for_identity("SÃO JOÃO")
        );
    }

    #[test]
    fn folds_diacritics_in_both_directions() {
        assert_eq!(
            normalize_for_identity("São João"),
            normalize_for_identity("Sao Joao")
        );
        assert_eq!(
            normalize_for_identity("Sao Joao"),
            normalize_for_identity("São João")
        );
    }

    #[test]
    fn distinct_names_stay_distinct() {
        assert_ne!(
            normalize_for_identity("São Paulo"),
            normalize_for_identity("São João")
        );
    }
}
