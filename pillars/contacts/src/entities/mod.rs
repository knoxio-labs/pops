//! The entities (contact) domain — the contacts pillar's authoritative store.
//!
//! - [`model`] — wire ↔ row mapping and the request/response body shapes.
//! - [`colours`] — the fixed colour palette `colour` is assigned/rerolled from.
//! - [`name_identity`] — what makes two names "the same name" for uniqueness.
//! - [`repo`] — parameterized data access (list/get/create/update/delete plus
//!   the bulk lookup and find-by-name idempotency helpers).
//! - [`routes`] — the axum handlers carrying the DOTTED `entities.*`
//!   operationIds.
//! - [`addresses_model`] / [`addresses_repo`] / [`addresses_routes`] — an
//!   entity's addresses (ADR-053): one row per branch, referenced by id from
//!   `purchases` rather than duplicated onto the order.

pub mod addresses_model;
pub mod addresses_repo;
pub mod addresses_routes;
pub mod colours;
pub mod model;
pub mod name_identity;
pub mod repo;
pub mod routes;

pub use routes::router;
