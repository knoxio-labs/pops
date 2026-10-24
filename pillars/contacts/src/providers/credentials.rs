//! Authenticated credential envelopes bound to a provider and source account.

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom, SystemRandom};
use std::io::Read;
use std::path::Path;
use zeroize::Zeroizing;

const VERSION: u8 = 1;
const NONCE_LENGTH: usize = 12;
const MAX_SECRET_LENGTH: usize = 16_384;

/// Sanitized credential failures. No error variant contains key or credential data.
#[derive(Debug, PartialEq, Eq)]
pub enum CredentialError {
    /// The operator key file could not be read.
    KeyUnavailable,
    /// The operator key is not exactly 64 hexadecimal characters.
    InvalidKey,
    /// A credential is empty or exceeds the storage bound.
    InvalidCredential,
    /// A credential envelope is corrupt, mismatched, or from another key.
    InvalidEnvelope,
    /// The operating system could not supply cryptographic randomness.
    RandomUnavailable,
}

impl std::fmt::Display for CredentialError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::KeyUnavailable => "CONTACTS_PROVIDER_KEY_UNAVAILABLE",
            Self::InvalidKey => "CONTACTS_PROVIDER_KEY_INVALID",
            Self::InvalidCredential => "CONTACTS_PROVIDER_CREDENTIAL_INVALID",
            Self::InvalidEnvelope => "CONTACTS_PROVIDER_CREDENTIAL_UNREADABLE",
            Self::RandomUnavailable => "CONTACTS_PROVIDER_RANDOM_UNAVAILABLE",
        })
    }
}

impl std::error::Error for CredentialError {}

/// A zeroizing credential buffer with no formatting or serialization implementation.
pub struct SecretBytes(Zeroizing<Vec<u8>>);

impl SecretBytes {
    /// Take ownership of a bounded, nonempty credential without retaining a copy.
    pub fn new(bytes: Vec<u8>) -> Result<Self, CredentialError> {
        let bytes = Zeroizing::new(bytes);
        if bytes.is_empty() || bytes.len() > MAX_SECRET_LENGTH {
            return Err(CredentialError::InvalidCredential);
        }
        Ok(Self(bytes))
    }

    /// Borrow plaintext only at the encryption or authenticated transport boundary.
    pub fn expose(&self) -> &[u8] {
        &self.0
    }
}

/// AES-256-GCM credential protector. The key is supplied by an operator secret file.
///
/// The process never creates or persists a fallback key. Losing this key requires
/// reconnecting provider accounts; replacing it does not decrypt existing envelopes.
pub struct CredentialCipher {
    key: LessSafeKey,
    random: SystemRandom,
}

impl CredentialCipher {
    /// Read a Docker-secret style file containing a 32-byte key encoded as 64 hex
    /// characters, with optional surrounding ASCII whitespace. Reads are bounded.
    pub fn from_secret_file(path: &Path) -> Result<Self, CredentialError> {
        let file = std::fs::File::open(path).map_err(|_| CredentialError::KeyUnavailable)?;
        let mut bytes = Zeroizing::new(Vec::new());
        file.take(130)
            .read_to_end(&mut bytes)
            .map_err(|_| CredentialError::KeyUnavailable)?;
        if bytes.len() == 130 {
            return Err(CredentialError::InvalidKey);
        }
        Self::from_hex(&bytes)
    }

    fn from_hex(bytes: &[u8]) -> Result<Self, CredentialError> {
        let bytes = bytes.trim_ascii();
        if bytes.len() != 64 {
            return Err(CredentialError::InvalidKey);
        }
        let mut key = Zeroizing::new([0u8; 32]);
        for (output, pair) in key.iter_mut().zip(bytes.chunks_exact(2)) {
            let high = hex_digit(pair[0]).ok_or(CredentialError::InvalidKey)?;
            let low = hex_digit(pair[1]).ok_or(CredentialError::InvalidKey)?;
            *output = (high << 4) | low;
        }
        Ok(Self {
            key: LessSafeKey::new(
                UnboundKey::new(&AES_256_GCM, key.as_ref())
                    .map_err(|_| CredentialError::InvalidKey)?,
            ),
            random: SystemRandom::new(),
        })
    }

    /// Encrypt with a fresh OS nonce and authenticated provider/account binding.
    /// The returned versioned binary envelope is suitable for a SQLite BLOB.
    pub fn encrypt(
        &self,
        provider: &str,
        account_id: &str,
        plaintext: &SecretBytes,
    ) -> Result<Vec<u8>, CredentialError> {
        let binding = binding(provider, account_id)?;
        let mut nonce = [0u8; NONCE_LENGTH];
        self.random
            .fill(&mut nonce)
            .map_err(|_| CredentialError::RandomUnavailable)?;
        let mut ciphertext = Zeroizing::new(plaintext.expose().to_vec());
        self.key
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(binding),
                &mut *ciphertext,
            )
            .map_err(|_| CredentialError::InvalidEnvelope)?;
        let mut envelope = Vec::with_capacity(1 + NONCE_LENGTH + ciphertext.len());
        envelope.push(VERSION);
        envelope.extend_from_slice(&nonce);
        envelope.extend_from_slice(&ciphertext);
        Ok(envelope)
    }

    /// Authenticate before returning plaintext; reject version, length, key,
    /// provider, account, nonce or ciphertext mismatches with the same safe error.
    pub fn decrypt(
        &self,
        provider: &str,
        account_id: &str,
        envelope: &[u8],
    ) -> Result<SecretBytes, CredentialError> {
        let binding = binding(provider, account_id)?;
        if envelope.len() < 1 + NONCE_LENGTH + AES_256_GCM.tag_len() + 1
            || envelope.len() > 1 + NONCE_LENGTH + AES_256_GCM.tag_len() + MAX_SECRET_LENGTH
            || envelope[0] != VERSION
        {
            return Err(CredentialError::InvalidEnvelope);
        }
        let mut nonce = [0u8; NONCE_LENGTH];
        nonce.copy_from_slice(&envelope[1..1 + NONCE_LENGTH]);
        let mut ciphertext = Zeroizing::new(envelope[1 + NONCE_LENGTH..].to_vec());
        let plaintext = self
            .key
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(binding),
                &mut ciphertext,
            )
            .map_err(|_| CredentialError::InvalidEnvelope)?;
        let length = plaintext.len();
        ciphertext.truncate(length);
        Ok(SecretBytes(ciphertext))
    }
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn binding(provider: &str, account_id: &str) -> Result<Vec<u8>, CredentialError> {
    if provider.is_empty()
        || account_id.is_empty()
        || provider.len() > 128
        || account_id.len() > 128
    {
        return Err(CredentialError::InvalidEnvelope);
    }
    Ok(format!(
        "contacts-provider-credential-v1:{}:{provider}:{account_id}",
        provider.len()
    )
    .into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cipher() -> CredentialCipher {
        CredentialCipher::from_hex(&[b'1'; 64]).expect("test key")
    }

    #[test]
    fn randomized_envelopes_round_trip_and_bind_both_identifiers() {
        let cipher = cipher();
        let plaintext = SecretBytes::new(vec![42; 25]).expect("test credential");
        let first = cipher.encrypt("google", "account-1", &plaintext).unwrap();
        let second = cipher.encrypt("google", "account-1", &plaintext).unwrap();
        assert_ne!(first, second);
        assert_eq!(
            cipher
                .decrypt("google", "account-1", &first)
                .unwrap()
                .expose(),
            plaintext.expose()
        );
        assert!(matches!(
            cipher.decrypt("icloud", "account-1", &first),
            Err(CredentialError::InvalidEnvelope)
        ));
        assert!(matches!(
            cipher.decrypt("google", "account-2", &first),
            Err(CredentialError::InvalidEnvelope)
        ));
        assert!(!first
            .windows(plaintext.expose().len())
            .any(|window| window == plaintext.expose()));
    }

    #[test]
    fn tampering_wrong_keys_truncation_and_version_changes_fail_closed() {
        let cipher = cipher();
        let plaintext = SecretBytes::new(vec![42]).unwrap();
        let envelope = cipher.encrypt("google", "account-1", &plaintext).unwrap();
        for index in 0..envelope.len() {
            let mut modified = envelope.clone();
            modified[index] ^= 1;
            assert!(matches!(
                cipher.decrypt("google", "account-1", &modified),
                Err(CredentialError::InvalidEnvelope)
            ));
        }
        for length in 0..envelope.len() {
            assert!(cipher
                .decrypt("google", "account-1", &envelope[..length])
                .is_err());
        }
        let wrong_key = CredentialCipher::from_hex(&[b'2'; 64]).unwrap();
        assert!(wrong_key.decrypt("google", "account-1", &envelope).is_err());
    }

    #[test]
    fn key_and_plaintext_bounds_are_enforced() {
        for bytes in [vec![], vec![b'1'; 63], vec![b'1'; 65], vec![b'z'; 64]] {
            assert!(matches!(
                CredentialCipher::from_hex(&bytes),
                Err(CredentialError::InvalidKey)
            ));
        }
        assert!(CredentialCipher::from_hex(&[b'1'; 64]).is_ok());
        assert!(SecretBytes::new(vec![]).is_err());
        assert!(SecretBytes::new(vec![0; MAX_SECRET_LENGTH + 1]).is_err());
        let largest = SecretBytes::new(vec![0; MAX_SECRET_LENGTH]).unwrap();
        let cipher = cipher();
        let encrypted = cipher.encrypt("icloud", "account-1", &largest).unwrap();
        assert_eq!(
            cipher
                .decrypt("icloud", "account-1", &encrypted)
                .unwrap()
                .expose()
                .len(),
            MAX_SECRET_LENGTH
        );
        assert!(cipher.encrypt("", "account-1", &largest).is_err());
        assert!(cipher.encrypt("icloud", "", &largest).is_err());
    }

    #[test]
    fn secret_file_reads_are_bounded_and_reject_unread_trailing_data() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp");
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(format!("provider-key-test-{}", uuid::Uuid::new_v4()));
        let mut bytes = vec![b'1'; 64];
        bytes.push(b'\n');
        std::fs::write(&path, &bytes).unwrap();
        assert!(CredentialCipher::from_secret_file(&path).is_ok());
        bytes.extend_from_slice(&[b' '; 130]);
        bytes.push(b'z');
        std::fs::write(&path, &bytes).unwrap();
        assert!(matches!(
            CredentialCipher::from_secret_file(&path),
            Err(CredentialError::InvalidKey)
        ));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn missing_key_has_no_fallback_and_errors_are_sanitized() {
        assert!(matches!(
            CredentialCipher::from_secret_file(Path::new("/nonexistent/contacts-key")),
            Err(CredentialError::KeyUnavailable)
        ));
        assert_eq!(
            CredentialError::InvalidEnvelope.to_string(),
            "CONTACTS_PROVIDER_CREDENTIAL_UNREADABLE"
        );
    }
}
