//! Fixed-parameter Google People pagination with seven-day checkpoint expiry.

use super::oauth::{retry_after, GoogleError};
use crate::imports::model::{qualify_structured_name, ImportPayload, StageRowInput};
use crate::persons::model::{ContactPointInput, ContactPointKind, PersonName};
use crate::providers::credentials::SecretBytes;
use crate::providers::sync::{PageProgress, ProviderChange, ProviderPage};
use crate::providers::transport::{
    ProviderOrigin, ProviderRequest, ProviderResponse, ProviderTransport,
};
use reqwest::{header::HeaderMap, Method, Url};
use serde::{Deserialize, Serialize};

const MAX_CURSOR: usize = 16_384;
const CHECKPOINT_LIFETIME: u64 = 7 * 24 * 60 * 60;

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
struct Checkpoint {
    token: String,
    full_synced_at: u64,
    #[serde(default)]
    other_contacts: bool,
}

#[derive(Deserialize, Serialize)]
struct Continuation {
    page_token: String,
    checkpoint: Option<Checkpoint>,
    full_started_at: u64,
    #[serde(default)]
    other_contacts: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Connections {
    #[serde(default, alias = "otherContacts")]
    connections: Vec<Person>,
    next_page_token: Option<String>,
    next_sync_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Person {
    resource_name: String,
    #[serde(default)]
    metadata: PersonMetadata,
    #[serde(default)]
    names: Vec<Name>,
    #[serde(default)]
    email_addresses: Vec<Point>,
    #[serde(default)]
    phone_numbers: Vec<Point>,
    #[serde(default)]
    urls: Vec<Point>,
}

#[derive(Default, Deserialize)]
struct PersonMetadata {
    #[serde(default)]
    deleted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Name {
    display_name: Option<String>,
    given_name: Option<String>,
    middle_name: Option<String>,
    family_name: Option<String>,
    honorific_prefix: Option<String>,
    honorific_suffix: Option<String>,
    metadata: Option<NameMetadata>,
}

#[derive(Deserialize)]
struct NameMetadata {
    #[serde(default)]
    primary: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Point {
    value: String,
    r#type: Option<String>,
    formatted_type: Option<String>,
}

#[derive(Deserialize)]
struct Failure {
    error: FailureDetails,
}
#[derive(Deserialize)]
struct FailureDetails {
    #[serde(default)]
    details: Vec<FailureReason>,
}
#[derive(Deserialize)]
struct FailureReason {
    reason: Option<String>,
}

/// Return the authenticated user's stable People resource key using the existing
/// read-only contacts grant; no OpenID or email scope is requested.
pub async fn account_key<T: ProviderTransport>(
    transport: &T,
    access_token: &SecretBytes,
) -> Result<String, GoogleError> {
    let response = get(transport, "https://people.googleapis.com/v1/people/me?personFields=metadata&sources=READ_SOURCE_TYPE_PROFILE", access_token).await?;
    let person: Person =
        serde_json::from_slice(response.body()).map_err(|_| GoogleError::InvalidResponse)?;
    if !valid_key(&person.resource_name) || person.resource_name == "people/me" {
        return Err(GoogleError::InvalidResponse);
    }
    Ok(person.resource_name)
}

/// Fetch one stable-parameter page. A checkpoint is usable for seven days from
/// its original full scan; incremental requests never extend that expiry.
/// Expiry requires the coordinator to discard staging and restart a full scan.
pub async fn sync_page<T: ProviderTransport>(
    transport: &T,
    access_token: &SecretBytes,
    checkpoint: Option<&str>,
    continuation: Option<&str>,
    now: u64,
) -> Result<ProviderPage, GoogleError> {
    sync_page_for_collection(
        transport,
        access_token,
        checkpoint,
        continuation,
        now,
        false,
    )
    .await
}

/// Fetch a separately consented Other contacts page. It shares the bounded
/// seven-day sync protocol but uses its own collection checkpoint namespace.
pub async fn sync_other_contacts_page<T: ProviderTransport>(
    transport: &T,
    access_token: &SecretBytes,
    checkpoint: Option<&str>,
    continuation: Option<&str>,
    now: u64,
) -> Result<ProviderPage, GoogleError> {
    sync_page_for_collection(transport, access_token, checkpoint, continuation, now, true).await
}

async fn sync_page_for_collection<T: ProviderTransport>(
    transport: &T,
    access_token: &SecretBytes,
    checkpoint: Option<&str>,
    continuation: Option<&str>,
    now: u64,
    other_contacts: bool,
) -> Result<ProviderPage, GoogleError> {
    let checkpoint = checkpoint.map(parse_checkpoint).transpose()?;
    if checkpoint
        .as_ref()
        .is_some_and(|checkpoint| checkpoint.other_contacts != other_contacts)
    {
        return Err(GoogleError::InvalidResponse);
    }
    if checkpoint.as_ref().is_some_and(|checkpoint| {
        now < checkpoint.full_synced_at || now - checkpoint.full_synced_at >= CHECKPOINT_LIFETIME
    }) {
        return Err(GoogleError::CursorExpired);
    }
    let page = match continuation {
        Some(cursor) if cursor.len() <= MAX_CURSOR => {
            let page: Continuation =
                serde_json::from_str(cursor).map_err(|_| GoogleError::InvalidResponse)?;
            if page.other_contacts != other_contacts
                || page.checkpoint != checkpoint
                || page.full_started_at > now
                || page.page_token.is_empty()
            {
                return Err(GoogleError::InvalidResponse);
            }
            page
        }
        Some(_) => return Err(GoogleError::InvalidResponse),
        None => Continuation {
            page_token: String::new(),
            checkpoint: checkpoint.clone(),
            full_started_at: now,
            other_contacts,
        },
    };
    let endpoint = if other_contacts {
        "https://people.googleapis.com/v1/otherContacts"
    } else {
        "https://people.googleapis.com/v1/people/me/connections"
    };
    let mut url = Url::parse(endpoint).map_err(|_| GoogleError::InvalidResponse)?;
    {
        let mut query = url.query_pairs_mut();
        query.extend_pairs([
            (
                if other_contacts {
                    "readMask"
                } else {
                    "personFields"
                },
                if other_contacts {
                    "names,emailAddresses,phoneNumbers,metadata"
                } else {
                    "names,emailAddresses,phoneNumbers,urls,metadata"
                },
            ),
            ("sources", "READ_SOURCE_TYPE_CONTACT"),
            ("pageSize", "1000"),
            ("requestSyncToken", "true"),
        ]);
        if let Some(checkpoint) = &checkpoint {
            query.append_pair("syncToken", &checkpoint.token);
        }
        if !page.page_token.is_empty() {
            query.append_pair("pageToken", &page.page_token);
        }
    }
    let response = get(transport, url.as_str(), access_token).await?;
    let connections: Connections =
        serde_json::from_slice(response.body()).map_err(|_| GoogleError::InvalidResponse)?;
    if connections.connections.len() > 1000 {
        return Err(GoogleError::InvalidResponse);
    }
    let next_page = connections
        .next_page_token
        .filter(|token| !token.is_empty());
    let next_sync = connections
        .next_sync_token
        .filter(|token| !token.is_empty());
    let progress = match (next_page, next_sync) {
        (Some(next), None) if next.len() <= 4096 && next != page.page_token => {
            PageProgress::Continue {
                cursor: serde_json::to_string(&Continuation {
                    page_token: next,
                    ..page
                })
                .map_err(|_| GoogleError::InvalidResponse)?,
            }
        }
        (None, Some(token)) if token.len() <= 4096 => PageProgress::Complete {
            checkpoint: Some(
                serde_json::to_string(&Checkpoint {
                    token,
                    other_contacts,
                    full_synced_at: checkpoint
                        .map_or(page.full_started_at, |checkpoint| checkpoint.full_synced_at),
                })
                .map_err(|_| GoogleError::InvalidResponse)?,
            ),
        },
        _ => return Err(GoogleError::InvalidResponse),
    };
    let changes: Vec<ProviderChange> = connections
        .connections
        .into_iter()
        .map(map_person)
        .collect::<Result<_, _>>()?;
    let seen_record_keys = changes
        .iter()
        .filter(|change| !change.row.removed)
        .map(|change| change.row.record_key.clone())
        .collect();
    Ok(ProviderPage {
        changes,
        seen_record_keys,
        progress,
    })
}

fn parse_checkpoint(cursor: &str) -> Result<Checkpoint, GoogleError> {
    if cursor.len() > MAX_CURSOR {
        return Err(GoogleError::InvalidResponse);
    }
    let checkpoint: Checkpoint =
        serde_json::from_str(cursor).map_err(|_| GoogleError::InvalidResponse)?;
    if checkpoint.token.is_empty() || checkpoint.token.len() > 4096 {
        return Err(GoogleError::InvalidResponse);
    }
    Ok(checkpoint)
}

async fn get<T: ProviderTransport>(
    transport: &T,
    url: &str,
    access_token: &SecretBytes,
) -> Result<ProviderResponse, GoogleError> {
    let mut authorization = b"Bearer ".to_vec();
    authorization.extend_from_slice(access_token.expose());
    let authorization =
        SecretBytes::new(authorization).map_err(|_| GoogleError::InvalidResponse)?;
    let response = transport
        .send(ProviderRequest {
            origin: ProviderOrigin::GooglePeople,
            method: Method::GET,
            url,
            authorization: Some(&authorization),
            headers: HeaderMap::new(),
            body: None,
        })
        .await
        .map_err(GoogleError::from)?;
    if response.status.is_success() {
        return Ok(response);
    }
    if response.status.as_u16() == 401 {
        return Err(GoogleError::ReauthorizationRequired);
    }
    if response.status.as_u16() == 429 || response.status.is_server_error() {
        return Err(GoogleError::Retryable(retry_after(&response.headers)));
    }
    if serde_json::from_slice::<Failure>(response.body()).is_ok_and(|failure| {
        failure
            .error
            .details
            .iter()
            .any(|detail| detail.reason.as_deref() == Some("EXPIRED_SYNC_TOKEN"))
    }) {
        return Err(GoogleError::CursorExpired);
    }
    Err(GoogleError::InvalidResponse)
}

fn map_person(person: Person) -> Result<ProviderChange, GoogleError> {
    if !valid_key(&person.resource_name) {
        return Err(GoogleError::InvalidResponse);
    }
    let removed = person.metadata.deleted;
    let payload = if removed {
        None
    } else {
        let primary = person
            .names
            .iter()
            .position(|name| {
                name.metadata
                    .as_ref()
                    .is_some_and(|metadata| metadata.primary)
            })
            .unwrap_or(0);
        let name = person.names.into_iter().nth(primary);
        let mut profile = PersonName::default();
        let display_name = name.and_then(|name| {
            profile.given_name = nonempty(name.given_name);
            profile.additional_names = nonempty(name.middle_name);
            profile.family_name = nonempty(name.family_name);
            profile.name_prefix = nonempty(name.honorific_prefix);
            profile.name_suffix = nonempty(name.honorific_suffix);
            nonempty(name.display_name)
        });
        let mut points = Vec::new();
        for (values, kind) in [
            (person.email_addresses, ContactPointKind::Email),
            (person.phone_numbers, ContactPointKind::Phone),
            (person.urls, ContactPointKind::Url),
        ] {
            for point in values {
                points.push(ContactPointInput {
                    kind,
                    value: point.value,
                    label: point.formatted_type.or(point.r#type),
                    country_code: None,
                });
            }
        }
        Some(ImportPayload {
            display_name,
            name: qualify_structured_name(profile),
            points,
        })
    };
    Ok(ProviderChange {
        row: StageRowInput {
            record_key: person.resource_name,
            payload,
            removed,
            errors: Vec::new(),
        },
        etag: None,
        uid: None,
    })
}

fn valid_key(key: &str) -> bool {
    key.starts_with("people/") && key.len() > 7 && key.len() <= 1024
}
fn nonempty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
#[path = "people_tests.rs"]
mod tests;
