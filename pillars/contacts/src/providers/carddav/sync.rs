use super::{joined, xml, xml_text, CardDavAdapter, CardDavCollection, CardDavError};
use crate::imports::file::payload_from_contact;
use crate::imports::model::StageRowInput;
use crate::imports::parser::{parse_file, FileEncoding, FileFormat};
use crate::providers::credentials::SecretBytes;
use crate::providers::sync::{PageProgress, ProviderChange, ProviderPage};
use crate::providers::transport::{ProviderOrigin, ProviderTransport};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MAX_CARD_BYTES: usize = 512 * 1024;
const MAX_REQUEST_BYTES: usize = 12 * 1024;
const MULTIGET_START: &str = "<c:addressbook-multiget xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:carddav\"><d:prop><d:getetag/><c:address-data/></d:prop>";
const MULTIGET_END: &str = "</c:addressbook-multiget>";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    collection: String,
    checkpoint: Option<String>,
    token: String,
}

impl<T: ProviderTransport> CardDavAdapter<T> {
    /// Read one complete sync page, fetching every changed vCard before returning.
    /// The checkpoint belongs to this collection; a continuation must come from
    /// the same run. Failed or partial reads never return an advancing checkpoint.
    pub async fn sync_page(
        &self,
        authorization: &SecretBytes,
        collection: &CardDavCollection,
        checkpoint: Option<&str>,
        continuation: Option<&str>,
        known_etags: &BTreeMap<String, String>,
    ) -> Result<ProviderPage, CardDavError> {
        if collection.key.len() > 4096 {
            return Err(CardDavError::ResponseLimit);
        }
        let collection_url = ProviderOrigin::Icloud.validate(&collection.key)?;
        if !collection_url.path().ends_with('/') {
            return Err(CardDavError::MalformedResponse);
        }
        if checkpoint.is_some_and(|value| value.is_empty() || value.len() > 4096) {
            return Err(CardDavError::MalformedResponse);
        }
        let token = continuation
            .map(|cursor| decode_cursor(cursor, collection, checkpoint))
            .transpose()?
            .or_else(|| checkpoint.map(str::to_owned));
        let body = format!("<d:sync-collection xmlns:d=\"DAV:\"><d:sync-token>{}</d:sync-token><d:sync-level>1</d:sync-level><d:limit><d:nresults>500</d:nresults></d:limit><d:prop><d:getetag/><d:resourcetype/></d:prop></d:sync-collection>", xml_text(token.as_deref().unwrap_or_default()));
        let response = self
            .request(authorization, &collection.key, b"REPORT", "0", body)
            .await?;
        let mut fallback = false;
        let listing = match response.status.as_u16() {
            207 => xml::parse(response.body())?,
            403 if token.is_some() && xml::invalid_token(response.body()) => {
                return Err(CardDavError::ResetRequired)
            }
            403 => return Err(CardDavError::Unauthorized),
            405 | 501 if checkpoint.is_none() && continuation.is_none() => {
                fallback = true;
                self.propfind(
                    authorization,
                    &collection.key,
                    "1",
                    "<d:getetag/><d:resourcetype/>",
                )
                .await?
            }
            405 | 501 => return Err(CardDavError::ResetRequired),
            _ => return Err(CardDavError::Unavailable),
        };
        let mut seen = BTreeSet::new();
        let mut encountered = BTreeSet::new();
        let mut changed = BTreeMap::new();
        let mut changes = Vec::new();
        let mut truncated = false;
        let mut saw_collection = false;
        for response in listing.responses {
            let href = joined(&collection.key, &response.href)?;
            if href == collection.key {
                if saw_collection {
                    return Err(CardDavError::MalformedResponse);
                }
                saw_collection = true;
                if response.status == Some(507) && !fallback {
                    truncated = true;
                } else if response.status.is_some_and(|status| status != 200) {
                    return Err(CardDavError::Unavailable);
                }
                if fallback
                    && !response
                        .properties
                        .iter()
                        .any(|(status, properties)| *status == 200 && properties.collection)
                {
                    return Err(CardDavError::MalformedResponse);
                }
                continue;
            }
            let href = member(&collection.key, &href)?;
            if !encountered.insert(href.clone()) {
                return Err(CardDavError::MalformedResponse);
            }
            if response.status == Some(404) {
                if checkpoint.is_none() && continuation.is_none() {
                    return Err(CardDavError::MalformedResponse);
                }
                changes.push(ProviderChange {
                    row: StageRowInput {
                        record_key: href,
                        payload: None,
                        removed: true,
                        errors: Vec::new(),
                    },
                    etag: None,
                    uid: None,
                });
                continue;
            }
            seen.insert(href.clone());
            if response.status.is_some_and(|status| status != 200) {
                return Err(CardDavError::Unavailable);
            }
            let mut etag = None;
            let mut is_collection = false;
            for (status, properties) in response.properties {
                if status != 200 {
                    continue;
                }
                is_collection |= properties.collection;
                merge(&mut etag, properties.etag)?;
            }
            if is_collection {
                return Err(CardDavError::MalformedResponse);
            }
            let etag = etag.ok_or(CardDavError::MalformedResponse)?;
            if etag.is_empty() || etag.len() > 4096 {
                return Err(CardDavError::MalformedResponse);
            }
            if known_etags.get(&href) != Some(&etag) {
                changed.insert(href, etag);
            }
        }
        if fallback && !saw_collection {
            return Err(CardDavError::MalformedResponse);
        }
        if !fallback && listing.token.is_none() {
            return Err(CardDavError::MalformedResponse);
        }
        if truncated && (listing.token == token || encountered.is_empty()) {
            return Err(CardDavError::MalformedResponse);
        }
        changes.extend(self.fetch_cards(authorization, collection, changed).await?);
        let progress = if truncated {
            let token = listing.token.ok_or(CardDavError::MalformedResponse)?;
            let cursor = Cursor {
                collection: collection.key.clone(),
                checkpoint: checkpoint.map(str::to_owned),
                token,
            };
            PageProgress::Continue {
                cursor: serde_json::to_string(&cursor)
                    .map_err(|_| CardDavError::MalformedResponse)?,
            }
        } else {
            PageProgress::Complete {
                checkpoint: if fallback { None } else { listing.token },
            }
        };
        Ok(ProviderPage {
            changes,
            seen_record_keys: seen.into_iter().collect(),
            progress,
        })
    }

    async fn fetch_cards(
        &self,
        authorization: &SecretBytes,
        collection: &CardDavCollection,
        changed: BTreeMap<String, String>,
    ) -> Result<Vec<ProviderChange>, CardDavError> {
        let mut remaining = changed.into_iter().peekable();
        let mut changes = Vec::new();
        let mut uids = BTreeSet::new();
        while remaining.peek().is_some() {
            let mut body = MULTIGET_START.to_owned();
            let mut requested = BTreeMap::new();
            while let Some((href, _)) = remaining.peek() {
                let element = format!("<d:href>{}</d:href>", xml_text(href));
                if body.len() + element.len() + MULTIGET_END.len() > MAX_REQUEST_BYTES
                    || requested.len() >= 100
                {
                    break;
                }
                let (href, etag) = remaining.next().ok_or(CardDavError::MalformedResponse)?;
                body.push_str(&element);
                requested.insert(href, etag);
            }
            if requested.is_empty() {
                return Err(CardDavError::ResponseLimit);
            }
            body.push_str(MULTIGET_END);
            let response = self
                .request(authorization, &collection.key, b"REPORT", "0", body)
                .await?;
            if response.status.as_u16() == 403 {
                return Err(CardDavError::Unauthorized);
            }
            if response.status.as_u16() != 207 {
                return Err(CardDavError::Unavailable);
            }
            let records = xml::parse(response.body())?;
            for response in records.responses {
                let href = member(&collection.key, &joined(&collection.key, &response.href)?)?;
                let expected_etag = requested
                    .remove(&href)
                    .ok_or(CardDavError::MalformedResponse)?;
                if response.status.is_some_and(|status| status != 200) {
                    return Err(CardDavError::Unavailable);
                }
                let mut etag = None;
                let mut card = None;
                for (status, properties) in response.properties {
                    if status != 200 {
                        continue;
                    }
                    merge(&mut etag, properties.etag)?;
                    merge(&mut card, properties.card)?;
                }
                if etag.as_ref() != Some(&expected_etag) {
                    return Err(CardDavError::Unavailable);
                }
                let card = card.ok_or(CardDavError::MalformedResponse)?;
                if card.len() > MAX_CARD_BYTES {
                    return Err(CardDavError::ResponseLimit);
                }
                let parsed = parse_file(card.as_bytes(), FileFormat::Vcard, FileEncoding::Utf8)
                    .map_err(|_| CardDavError::MalformedResponse)?;
                if parsed.contacts.len() != 1 || !parsed.errors.is_empty() {
                    return Err(CardDavError::MalformedResponse);
                }
                let contact = parsed
                    .contacts
                    .into_iter()
                    .next()
                    .ok_or(CardDavError::MalformedResponse)?;
                let uid = contact.uid.clone().ok_or(CardDavError::MalformedResponse)?;
                if !uids.insert(uid.clone()) {
                    return Err(CardDavError::MalformedResponse);
                }
                changes.push(ProviderChange {
                    row: StageRowInput {
                        record_key: href,
                        payload: Some(payload_from_contact(contact)),
                        removed: false,
                        errors: Vec::new(),
                    },
                    etag: Some(expected_etag),
                    uid: Some(uid),
                });
            }
            if !requested.is_empty() {
                return Err(CardDavError::MalformedResponse);
            }
        }
        Ok(changes)
    }
}

fn decode_cursor(
    cursor: &str,
    collection: &CardDavCollection,
    checkpoint: Option<&str>,
) -> Result<String, CardDavError> {
    if cursor.len() > 16_384 {
        return Err(CardDavError::ResponseLimit);
    }
    let cursor: Cursor =
        serde_json::from_str(cursor).map_err(|_| CardDavError::MalformedResponse)?;
    if cursor.collection != collection.key
        || cursor.checkpoint.as_deref() != checkpoint
        || cursor.token.is_empty()
        || cursor.token.len() > 4096
    {
        return Err(CardDavError::MalformedResponse);
    }
    Ok(cursor.token)
}

fn member(collection: &str, href: &str) -> Result<String, CardDavError> {
    let collection = ProviderOrigin::Icloud.validate(collection)?;
    let href = ProviderOrigin::Icloud.validate(href)?;
    let path = href.path().to_ascii_lowercase();
    if path.contains("%2f") || path.contains("%5c") {
        return Err(CardDavError::MalformedResponse);
    }
    if collection.origin() != href.origin()
        || !href.path().starts_with(collection.path())
        || href.path() == collection.path()
    {
        return Err(CardDavError::MalformedResponse);
    }
    Ok(href.to_string())
}

fn merge(target: &mut Option<String>, value: Option<String>) -> Result<(), CardDavError> {
    if let Some(value) = value {
        if target.as_ref().is_some_and(|current| current != &value) {
            return Err(CardDavError::MalformedResponse);
        }
        *target = Some(value);
    }
    Ok(())
}
