//! Deterministic request and file byte identity.

use sha2::{Digest, Sha256};

/// Return the lowercase SHA-256 digest of exact bytes, without normalization.
pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    #[test]
    fn hashes_exact_bytes() {
        assert_eq!(
            super::sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_ne!(super::sha256_hex(b"abc"), super::sha256_hex(b"abc\n"));
    }
}
