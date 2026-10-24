//! Conservative comparison keys retaining original source values outside the matcher.

use unicode_normalization::UnicodeNormalization;

/// Trims outer whitespace and lowercases the ASCII domain, preserving the local part exactly.
/// Only unquoted local parts and ASCII DNS domains qualify; unsupported forms remain observations.
pub fn normalize_email(value: &str) -> Option<String> {
    let value = value.trim();
    if value
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return None;
    }
    let (local, domain) = value.split_once('@')?;
    if local.is_empty()
        || local.starts_with('.')
        || local.ends_with('.')
        || local.contains("..")
        || local.chars().any(|character| {
            matches!(
                character,
                '(' | ')' | '<' | '>' | ',' | ';' | ':' | '\\' | '"' | '[' | ']'
            )
        })
        || domain.len() > 253
        || !domain.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
    {
        return None;
    }
    Some(format!("{local}@{}", domain.to_ascii_lowercase()))
}

/// Validates an explicit international phone number and returns its E.164 representation.
/// No country is inferred; local numbers, extensions and non-ASCII digits are rejected.
pub fn normalize_phone(value: &str) -> Option<String> {
    if !value.trim().starts_with('+') {
        return None;
    }
    normalized_phone(value, None)
}

/// Validates a phone number using an explicit ISO 3166-1 alpha-2 country for national input.
/// Invalid country codes, extensions and non-ASCII digits cannot produce comparison keys.
pub fn normalize_phone_for_country(value: &str, country_code: &str) -> Option<String> {
    let country = phone_country(country_code)?;
    normalized_phone(value, Some(country))
}

pub(crate) fn phone_country(country_code: &str) -> Option<rlibphonenumber::Region> {
    if country_code.len() != 2 || !country_code.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return None;
    }
    let region = country_code.to_ascii_uppercase().parse().ok()?;
    rlibphonenumber::PHONE_NUMBER_UTIL
        .get_supported_regions()
        .any(|known| known == region)
        .then_some(region)
}

fn normalized_phone(value: &str, country: Option<rlibphonenumber::Region>) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().filter(|character| *character == '+').count() > 1
        || (value.contains('+') && !value.starts_with('+'))
        || !value.chars().all(|character| {
            character.is_ascii_digit() || matches!(character, '+' | ' ' | '-' | '(' | ')' | '.')
        })
    {
        return None;
    }
    let number = rlibphonenumber::PhoneNumber::parse(value, country).ok()?;
    number.is_valid().then(|| {
        number
            .format_as(rlibphonenumber::PhoneNumberFormat::E164)
            .into_owned()
    })
}

/// Produces a case-insensitive NFC name key while preserving accents, punctuation and token order.
pub fn normalize_name(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .nfc()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{normalize_email, normalize_name, normalize_phone, normalize_phone_for_country};

    #[test]
    fn email_domain_normalizes_without_rewriting_local_identity() {
        assert_eq!(
            normalize_email(" A.b+tag@EXAMPLE.COM ").as_deref(),
            Some("A.b+tag@example.com")
        );
        assert_ne!(
            normalize_email("A@example.com"),
            normalize_email("a@example.com")
        );
        assert_ne!(
            normalize_email("é@example.com"),
            normalize_email("e\u{301}@example.com")
        );
        for value in [
            "",
            "@example.com",
            "a@",
            "a@@b",
            "a b@example.com",
            "a@example.com\nheader",
            "a@#invalid",
            ".a@example.com",
            "a..b@example.com",
            "a@-invalid.example",
        ] {
            assert_eq!(normalize_email(value), None, "{value:?}");
        }
    }

    #[test]
    fn phones_require_valid_international_or_explicit_country_context() {
        assert_eq!(
            normalize_phone(" +61 (412) 345-678 ").as_deref(),
            Some("+61412345678")
        );
        assert_eq!(
            normalize_phone_for_country("0412 345 678", "AU").as_deref(),
            Some("+61412345678")
        );
        assert_eq!(
            normalize_phone_for_country("0412 345 678", "au").as_deref(),
            Some("+61412345678")
        );
        for country in ["invalid", "ZZ", "AA", "001", ""] {
            assert_eq!(normalize_phone_for_country("+61412345678", country), None);
        }
        for (value, country, expected) in [
            ("202-555-0123", "US", "+12025550123"),
            ("(11) 98765-4321", "BR", "+5511987654321"),
            ("020 7946 0018", "GB", "+442079460018"),
        ] {
            assert_eq!(normalize_phone(value), None);
            assert_eq!(
                normalize_phone_for_country(value, country).as_deref(),
                Some(expected)
            );
            assert_eq!(normalize_phone(expected).as_deref(), Some(expected));
        }
        for value in [
            "",
            "0412345678",
            "0061412345678",
            "+00012345678",
            "+61412345678 ext 2",
            "+６１４１２３４５６７８",
            "+61412345678999999",
        ] {
            assert_eq!(normalize_phone(value), None, "{value:?}");
        }
    }

    #[test]
    fn name_keys_preserve_unicode_distinctions_except_canonical_equivalence() {
        assert_eq!(
            normalize_name(" José   SILVA "),
            normalize_name("Jose\u{301} Silva")
        );
        assert_ne!(normalize_name("José Silva"), normalize_name("Jose Silva"));
        assert_ne!(normalize_name("Straße"), normalize_name("Strasse"));
        assert_ne!(normalize_name("İpek"), normalize_name("Ipek"));
        assert_eq!(normalize_name(" \t\n"), "");
    }
}
