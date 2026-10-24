//! Conservative, storage-independent contact identity classification.

mod matcher;
mod model;
pub mod normalize;

pub use matcher::{classify, classify_after_ingestion, matching_signals};
pub use model::{
    CandidateOrigin, CompleteName, E164Phone, IdentityCandidate, IdentityOutcome, IdentityRecord,
    KeepSeparate, MatchReason, NameEvidence, NormalizedEmail, ReviewReason, SourceIdentity,
};
pub use normalize::{
    normalize_email, normalize_name, normalize_phone, normalize_phone_for_country,
};

#[cfg(test)]
mod tests;
