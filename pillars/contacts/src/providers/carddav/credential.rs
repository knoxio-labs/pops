//! Bounded iCloud app-password framing and Basic authorization construction.

use crate::providers::credentials::{CredentialError, SecretBytes};
use base64::Engine;
use zeroize::Zeroizing;

const MAGIC: &[u8; 4] = b"CDV\x01";
const HEADER_BYTES: usize = 8;
const MAX_USERNAME_BYTES: usize = 1024;
const MAX_PASSWORD_BYTES: usize = 256;

/// Validated iCloud credentials held only in zeroizing buffers. The account name
/// and app password cannot be formatted or serialized through a general serializer.
pub struct CardDavCredential {
    username: SecretBytes,
    password: SecretBytes,
}

impl CardDavCredential {
    /// Take ownership of an account name and app password without normalizing
    /// either. Names containing a colon, whitespace or controls are refused;
    /// passwords must be nonempty UTF-8 without whitespace or controls.
    /// The UTF-8 byte limits are 1024 for names and 256 for app passwords.
    pub fn new(username: String, password: SecretBytes) -> Result<Self, CredentialError> {
        Self::from_parts(SecretBytes::new(username.into_bytes())?, password)
    }

    /// Encode a versioned length-prefixed bundle for the shared authenticated
    /// credential cipher. This method performs no encryption or persistence.
    pub fn encode(&self) -> SecretBytes {
        let username = self.username.expose();
        let password = self.password.expose();
        let mut encoded = Zeroizing::new(Vec::with_capacity(
            HEADER_BYTES + username.len() + password.len(),
        ));
        encoded.extend_from_slice(MAGIC);
        encoded.extend_from_slice(
            &u16::try_from(username.len())
                .expect("validated username length fits u16")
                .to_be_bytes(),
        );
        encoded.extend_from_slice(
            &u16::try_from(password.len())
                .expect("validated password length fits u16")
                .to_be_bytes(),
        );
        encoded.extend_from_slice(username);
        encoded.extend_from_slice(password);
        SecretBytes::new(std::mem::take(&mut *encoded))
            .expect("validated CardDAV bundle fits the shared secret bound")
    }

    /// Decode only the supported version with exact lengths; malformed or
    /// trailing bytes never become an authentication header.
    pub fn decode(encoded: &SecretBytes) -> Result<Self, CredentialError> {
        let bytes = encoded.expose();
        if bytes.len() < HEADER_BYTES || !bytes.starts_with(MAGIC) {
            return Err(CredentialError::InvalidCredential);
        }
        let username_length = usize::from(u16::from_be_bytes([bytes[4], bytes[5]]));
        let password_length = usize::from(u16::from_be_bytes([bytes[6], bytes[7]]));
        if !(1..=MAX_USERNAME_BYTES).contains(&username_length)
            || !(1..=MAX_PASSWORD_BYTES).contains(&password_length)
            || bytes.len() != HEADER_BYTES + username_length + password_length
        {
            return Err(CredentialError::InvalidCredential);
        }
        let split = HEADER_BYTES + username_length;
        Self::from_parts(
            SecretBytes::new(bytes[HEADER_BYTES..split].to_vec())?,
            SecretBytes::new(bytes[split..].to_vec())?,
        )
    }

    /// Construct the complete Basic header in zeroizing storage for the vetted
    /// transport. Credentials are never placed in a URL or diagnostic string.
    pub fn authorization(&self) -> SecretBytes {
        let mut plaintext = Zeroizing::new(Vec::with_capacity(
            self.username.expose().len() + self.password.expose().len() + 1,
        ));
        plaintext.extend_from_slice(self.username.expose());
        plaintext.push(b':');
        plaintext.extend_from_slice(self.password.expose());
        let length = base64::encoded_len(plaintext.len(), true)
            .expect("validated Basic input has a bounded encoded length");
        let mut header = Zeroizing::new(vec![0; 6 + length]);
        header[..6].copy_from_slice(b"Basic ");
        base64::engine::general_purpose::STANDARD
            .encode_slice(&plaintext, &mut header[6..])
            .expect("Basic output buffer uses the exact encoded length");
        SecretBytes::new(std::mem::take(&mut *header))
            .expect("validated Basic header fits the shared secret bound")
    }

    fn from_parts(username: SecretBytes, password: SecretBytes) -> Result<Self, CredentialError> {
        let username_text = std::str::from_utf8(username.expose())
            .map_err(|_| CredentialError::InvalidCredential)?;
        let password_text = std::str::from_utf8(password.expose())
            .map_err(|_| CredentialError::InvalidCredential)?;
        if username.expose().len() > MAX_USERNAME_BYTES
            || password.expose().len() > MAX_PASSWORD_BYTES
            || username_text.chars().any(|character| {
                character == ':' || character.is_control() || character.is_whitespace()
            })
            || password_text
                .chars()
                .any(|character| character.is_control() || character.is_whitespace())
        {
            return Err(CredentialError::InvalidCredential);
        }
        Ok(Self { username, password })
    }
}
