use super::credential::CardDavCredential;
use crate::providers::credentials::{CredentialError, SecretBytes};
use base64::Engine;
use zeroize::Zeroizing;

fn password() -> SecretBytes {
    SecretBytes::new(b"fictional-app-password".to_vec()).unwrap()
}

#[test]
fn credential_roundtrip_preserves_bytes_and_emits_basic_only_at_boundary() {
    let original = CardDavCredential::new("fictional@example.test".to_owned(), password()).unwrap();
    let encoded = original.encode();
    let decoded = CardDavCredential::decode(&encoded).unwrap();
    assert!(decoded.encode().expose() == encoded.expose());
    let authorization = decoded.authorization();
    assert!(authorization.expose().starts_with(b"Basic "));
    let plaintext = Zeroizing::new(
        base64::engine::general_purpose::STANDARD
            .decode(&authorization.expose()[6..])
            .unwrap(),
    );
    assert!(plaintext.as_slice() == b"fictional@example.test:fictional-app-password");
}

#[test]
fn credential_accepts_documented_bounds_and_rejects_overflow() {
    for username_length in [1, 1024] {
        for password_length in [1, 256] {
            let password = SecretBytes::new(vec![b'x'; password_length]).unwrap();
            let credential = CardDavCredential::new("u".repeat(username_length), password).unwrap();
            assert!(CardDavCredential::decode(&credential.encode()).is_ok());
            assert!(!credential.authorization().expose().is_empty());
        }
    }
    assert!(matches!(
        CardDavCredential::new(String::new(), password()),
        Err(CredentialError::InvalidCredential)
    ));
    assert!(matches!(
        CardDavCredential::new("u".repeat(1025), password()),
        Err(CredentialError::InvalidCredential)
    ));
    assert!(matches!(
        CardDavCredential::new(
            "fictional".to_owned(),
            SecretBytes::new(vec![b'x'; 257]).unwrap()
        ),
        Err(CredentialError::InvalidCredential)
    ));
}

#[test]
fn credential_bounds_count_utf8_bytes_and_preserve_unicode() {
    let credential = CardDavCredential::new(
        "é".repeat(512),
        SecretBytes::new("é".repeat(128).into_bytes()).unwrap(),
    )
    .unwrap();
    let decoded = CardDavCredential::decode(&credential.encode()).unwrap();
    assert!(decoded.authorization().expose() == credential.authorization().expose());
    assert!(matches!(
        CardDavCredential::new("é".repeat(513), password()),
        Err(CredentialError::InvalidCredential)
    ));
    assert!(matches!(
        CardDavCredential::new(
            "fictional".to_owned(),
            SecretBytes::new("é".repeat(129).into_bytes()).unwrap()
        ),
        Err(CredentialError::InvalidCredential)
    ));
}

#[test]
fn credential_refuses_basic_delimiter_controls_whitespace_and_invalid_utf8() {
    for username in [
        "fictional:injected",
        "fictional\r\nheader",
        "fictional\u{0085}",
        "fictional\u{2003}",
        " fictional",
        "fictional ",
    ] {
        assert!(matches!(
            CardDavCredential::new(username.to_owned(), password()),
            Err(CredentialError::InvalidCredential)
        ));
    }
    for value in [
        b"fictional\n".to_vec(),
        "fictional\u{0085}".as_bytes().to_vec(),
        b"fictional password".to_vec(),
        vec![0xff],
    ] {
        assert!(matches!(
            CardDavCredential::new("fictional".to_owned(), SecretBytes::new(value).unwrap()),
            Err(CredentialError::InvalidCredential)
        ));
    }
}

#[test]
fn credential_decoder_refuses_unknown_versions_truncation_lengths_and_trailing_data() {
    let encoded = CardDavCredential::new("fictional".to_owned(), password())
        .unwrap()
        .encode();
    for length in 1..encoded.expose().len() {
        let truncated = SecretBytes::new(encoded.expose()[..length].to_vec()).unwrap();
        assert!(matches!(
            CardDavCredential::decode(&truncated),
            Err(CredentialError::InvalidCredential)
        ));
    }
    for index in [0, 3, 4, 5, 6, 7] {
        let mut corrupted = Zeroizing::new(encoded.expose().to_vec());
        corrupted[index] ^= 0xff;
        let corrupted = SecretBytes::new(std::mem::take(&mut *corrupted)).unwrap();
        assert!(matches!(
            CardDavCredential::decode(&corrupted),
            Err(CredentialError::InvalidCredential)
        ));
    }
    let mut trailing = Zeroizing::new(encoded.expose().to_vec());
    trailing.push(b'x');
    assert!(matches!(
        CardDavCredential::decode(&SecretBytes::new(std::mem::take(&mut *trailing)).unwrap()),
        Err(CredentialError::InvalidCredential)
    ));
}
