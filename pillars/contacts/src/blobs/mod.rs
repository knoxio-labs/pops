//! Generic binary blob storage backing the entities avatar/poster asset ids.
//!
//! - [`repo`] — parameterized data access (create/get/delete) against the
//!   `blobs` table.
//!
//! There is no wire model: a blob is never serialized as JSON. It is served
//! as raw bytes with its stored content type (see `entities::routes`), and
//! its id is the opaque string entities store in `avatar_asset_id` /
//! `poster_asset_id`.

pub mod repo;
