//! Person-specific local profiles and contact identities attached to fleet entity IDs.

pub mod model;
pub mod repo;
pub mod routes;

/// Atomic editable facts and immutable operation receipts.
pub mod facts_model;
/// Exact-identity local decision projections.
pub mod facts_projection;
/// HTTP endpoints for person fact snapshots and mutations.
pub mod facts_routes;
/// Atomic local fact persistence and guarded undo.
pub mod facts_service;

mod facts_history;
