//! Provider credential protection and outbound request boundaries.

pub mod credentials;
pub mod human_auth;
pub mod oauth_state;
pub mod store;
pub mod transport;

#[cfg(test)]
mod persistence_tests;
