//! Durable provider pages and account-wide all-or-nothing reconciliation.

mod finalize;
pub mod lease;
mod model;
mod repo;
pub mod service;

pub use model::{
    CollectionPlan, PageProgress, ProviderChange, ProviderPage, SyncCollection, SyncRun,
};

pub use service::{
    abort_sync, begin_sync, checkpoint, get_run, known_etags, resumable_runs, stage_page,
    validate_batch, SyncError,
};

#[cfg(test)]
mod tests;

pub use finalize::{finalize_claimed, finalize_sync};
