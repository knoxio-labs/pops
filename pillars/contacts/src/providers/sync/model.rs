//! Provider-neutral pages consumed by durable account sync staging.

use crate::imports::model::StageRowInput;

/// One source observation or tombstone with provider revision metadata.
#[derive(Clone)]
pub struct ProviderChange {
    /// Shared import observation; provider validation failures abort the scan.
    pub row: StageRowInput,
    /// CardDAV or other provider revision, retained without changing identity.
    pub etag: Option<String>,
    /// Provider-declared UID for audit; identity remains the namespaced record key.
    pub uid: Option<String>,
}

/// Explicit scan continuation or terminal checkpoint. A complete scan may have
/// no checkpoint when the provider supports only complete enumeration.
#[derive(Clone)]
pub enum PageProgress {
    /// Opaque continuation for the next page; no live checkpoint is advanced.
    Continue {
        /// Cursor interpreted only by the same provider and collection.
        cursor: String,
    },
    /// Every resource and per-item response in this collection was reconciled.
    Complete {
        /// Terminal cursor committed only after the whole account scan succeeds.
        checkpoint: Option<String>,
    },
}

/// One bounded, validated page from a provider adapter. Full enumeration reports
/// every observed key, including unchanged resources omitted from `changes`.
#[derive(Clone)]
pub struct ProviderPage {
    /// Changed observations or explicit provider deletions.
    pub changes: Vec<ProviderChange>,
    /// All observed resources, including unchanged ETags during a full scan.
    pub seen_record_keys: Vec<String>,
    /// Continuation or proof that collection enumeration completed successfully.
    pub progress: PageProgress,
}

/// One discovered collection included in an account-wide atomic scan.
#[derive(Clone)]
pub struct CollectionPlan {
    /// Stable, provider-approved collection namespace.
    pub key: String,
    /// Whether absence from the complete seen-key set means source removal.
    pub full_snapshot: bool,
}

/// Durable run state, including account epoch and collection continuation points.
pub struct SyncRun {
    /// Durable job identifier.
    pub id: String,
    /// Credential-bearing source account namespace.
    pub account_id: String,
    /// Connection lifecycle fence captured before any network request.
    pub epoch: crate::providers::store::AccountEpoch,
    /// One of running, completed, failed or cancelled.
    pub status: String,
    /// Every discovered or removed collection participating in this atomic scan.
    pub collections: Vec<SyncCollection>,
}

/// A collection's server-side progress persisted between provider requests.
#[derive(sqlx::FromRow)]
pub struct SyncCollection {
    /// Stable collection namespace.
    pub key: String,
    /// Whether completed enumeration permits absence-based removal.
    pub full_snapshot: bool,
    /// Whether the adapter proved collection enumeration complete.
    pub complete: bool,
    /// The checkpoint that all requests in this scan must consistently use.
    pub checkpoint: Option<String>,
    /// The next opaque page cursor, or none for the initial/terminal page.
    pub continuation: Option<String>,
}
