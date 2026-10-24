//! Conservative, storage-independent contact identity classification.

pub mod normalize;

pub use normalize::{
    normalize_email, normalize_name, normalize_phone, normalize_phone_for_country,
};
