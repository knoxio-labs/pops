use super::normalize::{normalize_email, normalize_name, normalize_phone};

/// A validated comparison key preserving the email local part exactly.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct NormalizedEmail(String);

impl NormalizedEmail {
    /// Accepts an already normalized email, rejecting values needing normalization.
    pub fn new(value: &str) -> Option<Self> {
        (normalize_email(value).as_deref() == Some(value)).then(|| Self(value.to_owned()))
    }

    /// Returns the comparison key without changing the original source observation.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A validated international phone comparison key in E.164 representation.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct E164Phone(String);

impl E164Phone {
    /// Accepts an already normalized international number; local numbers are rejected.
    pub fn new(value: &str) -> Option<Self> {
        (normalize_phone(value).as_deref() == Some(value)).then(|| Self(value.to_owned()))
    }

    /// Returns the normalized comparison key.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Complete structured name evidence, normalized without removing accents or punctuation.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CompleteName {
    given: String,
    additional: String,
    family: String,
    suffix: String,
    full: String,
}

impl CompleteName {
    /// Requires nonblank given and family names, rather than inferring completeness from words.
    pub fn new(given: &str, family: &str) -> Option<Self> {
        Self::with_parts(given, "", family, "")
    }

    /// Preserves component boundaries, middle names and generational suffixes in comparisons.
    pub fn with_parts(given: &str, additional: &str, family: &str, suffix: &str) -> Option<Self> {
        let given = normalize_name(given);
        let additional = normalize_name(additional);
        let family = normalize_name(family);
        let suffix = normalize_name(suffix);
        if given.is_empty() || family.is_empty() {
            return None;
        }
        let full = [&given, &additional, &family, &suffix]
            .into_iter()
            .filter(|part| !part.is_empty())
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        Some(Self {
            given,
            additional,
            family,
            suffix,
            full,
        })
    }

    /// Returns the canonical, accent-preserving full-name comparison key.
    pub fn as_str(&self) -> &str {
        &self.full
    }
}

/// Separates display text from proven complete structured-name evidence.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NameEvidence {
    pub display_name: Option<String>,
    pub complete_name: Option<CompleteName>,
}

/// A provider-scoped stable source binding; callers must exclude batch ordinals and display names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceIdentity {
    provider: String,
    source_key: String,
}

impl SourceIdentity {
    /// Constructs a trusted binding from nonblank provider and stable source identifiers.
    /// The caller is responsible for verifying that the provider guarantees key stability.
    pub fn new(provider: &str, source_key: &str) -> Option<Self> {
        if provider.trim().is_empty() || source_key.trim().is_empty() {
            return None;
        }
        Some(Self {
            provider: provider.to_owned(),
            source_key: source_key.to_owned(),
        })
    }
}

/// One source observation. IDs must remain stable wherever keep-separate decisions refer to them.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct IdentityRecord {
    pub id: String,
    pub source: Option<SourceIdentity>,
    pub emails: Vec<NormalizedEmail>,
    pub phones: Vec<E164Phone>,
    pub name: NameEvidence,
}

/// A candidate entity, including historical member IDs and every existing or batch observation.
/// Include the entire batch before classifying any row; never feed earlier automatic merges back in.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityCandidate {
    pub entity_id: String,
    pub origin: CandidateOrigin,
    pub member_ids: Vec<String>,
    pub records: Vec<IdentityRecord>,
}

/// Distinguishes persisted bindings from batch observations when excluding a row from its own search.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateOrigin {
    Existing,
    Batch,
}

/// A symmetric rejection between record/entity IDs, including historical group members.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeepSeparate {
    pub left_id: String,
    pub right_id: String,
}

/// Evidence sufficient for an otherwise unambiguous automatic match.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum MatchReason {
    Email,
    Phone,
    CompleteName,
}

/// Why a possible identity match requires an explicit decision.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewReason {
    ConflictingSourceBindings,
    SharedIdentifier,
    ConflictingSignals,
    AmbiguousName,
    IncompleteName,
    KeepSeparate,
    BatchCollision,
}

/// A pure classification; callers persist decisions and implement merges separately.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum IdentityOutcome {
    RecognizedSource {
        entity_id: String,
    },
    New,
    AutoMatch {
        entity_id: String,
        reason: MatchReason,
    },
    Review {
        reason: ReviewReason,
        candidates: Vec<String>,
    },
}
