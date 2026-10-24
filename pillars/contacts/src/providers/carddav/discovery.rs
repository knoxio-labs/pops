use super::{joined, xml, CardDavAccount, CardDavAdapter, CardDavCollection, CardDavError};
use crate::providers::credentials::SecretBytes;
use crate::providers::transport::ProviderTransport;
use std::collections::{BTreeMap, BTreeSet};

const DISCOVERY: &str = "https://contacts.icloud.com/";

impl<T: ProviderTransport> CardDavAdapter<T> {
    /// Discover the authenticated principal's books from the fixed iCloud origin.
    /// Every returned href is revalidated before another authenticated read occurs.
    pub async fn discover(
        &self,
        authorization: &SecretBytes,
    ) -> Result<Vec<CardDavCollection>, CardDavError> {
        self.discover_account(authorization)
            .await
            .map(|account| account.collections)
    }

    /// Discover the authenticated server principal and its books. The principal
    /// key is a canonical vetted URL suitable for account reconnect comparison.
    pub async fn discover_account(
        &self,
        authorization: &SecretBytes,
    ) -> Result<CardDavAccount, CardDavError> {
        let principals = self
            .propfind(authorization, DISCOVERY, "0", "<d:current-user-principal/>")
            .await?;
        let mut principal = None;
        for response in principals.responses {
            if response.status.is_some_and(|status| status != 200) {
                return Err(CardDavError::Unavailable);
            }
            for (status, properties) in response.properties {
                if status != 200 {
                    return Err(CardDavError::Unavailable);
                }
                if let Some(href) = properties.principal {
                    let href = joined(DISCOVERY, &href)?;
                    if principal.as_ref().is_some_and(|current| current != &href) {
                        return Err(CardDavError::MalformedResponse);
                    }
                    principal = Some(href);
                }
            }
        }
        let principal = principal.ok_or(CardDavError::MalformedResponse)?;
        let homes = self
            .propfind(authorization, &principal, "0", "<c:addressbook-home-set/>")
            .await?;
        let mut home_urls = Vec::new();
        for response in homes.responses {
            if response.status.is_some_and(|status| status != 200) {
                return Err(CardDavError::Unavailable);
            }
            for (status, properties) in response.properties {
                if status != 200 {
                    return Err(CardDavError::Unavailable);
                }
                for href in properties.homes {
                    let home = joined(&principal, &href)?;
                    if !home_urls.contains(&home) {
                        home_urls.push(home);
                    }
                }
            }
        }
        if home_urls.is_empty() || home_urls.len() > 16 {
            return Err(CardDavError::MalformedResponse);
        }
        let mut books = BTreeMap::new();
        for home in home_urls {
            let listing = self
                .propfind(
                    authorization,
                    &home,
                    "1",
                    "<d:resourcetype/><d:displayname/>",
                )
                .await?;
            let mut seen = BTreeSet::new();
            let mut home_proven = false;
            for response in listing.responses {
                if response.status.is_some_and(|status| status != 200) {
                    return Err(CardDavError::Unavailable);
                }
                let key = joined(&home, &response.href)?;
                if !seen.insert(key.clone()) {
                    return Err(CardDavError::MalformedResponse);
                }
                let mut resource_type = None;
                let mut display_name = None;
                for (status, properties) in response.properties {
                    if properties.resource_type_present {
                        if status != 200 {
                            return Err(CardDavError::Unavailable);
                        }
                        if resource_type
                            .replace((properties.collection, properties.addressbook))
                            .is_some()
                        {
                            return Err(CardDavError::MalformedResponse);
                        }
                    }
                    if status != 200 {
                        continue;
                    }
                    if properties.display_name.is_some() {
                        display_name = properties.display_name;
                    }
                }
                let (collection, addressbook) =
                    resource_type.ok_or(CardDavError::MalformedResponse)?;
                if key == home {
                    if !collection {
                        return Err(CardDavError::MalformedResponse);
                    }
                    home_proven = true;
                }
                if addressbook {
                    if !collection {
                        return Err(CardDavError::MalformedResponse);
                    }
                    if !key.ends_with('/') {
                        return Err(CardDavError::MalformedResponse);
                    }
                    books.insert(key.clone(), CardDavCollection { key, display_name });
                }
                if books.len() > 256 {
                    return Err(CardDavError::ResponseLimit);
                }
            }
            if !home_proven {
                return Err(CardDavError::MalformedResponse);
            }
        }
        Ok(CardDavAccount {
            principal_key: principal,
            collections: books.into_values().collect(),
        })
    }

    pub(super) async fn propfind(
        &self,
        authorization: &SecretBytes,
        url: &str,
        depth: &'static str,
        properties: &str,
    ) -> Result<xml::Multistatus, CardDavError> {
        let body = format!("<d:propfind xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:carddav\"><d:prop>{properties}</d:prop></d:propfind>");
        let response = self
            .request(authorization, url, b"PROPFIND", depth, body)
            .await?;
        if response.status.as_u16() == 403 {
            return Err(CardDavError::Unauthorized);
        }
        if response.status.as_u16() != 207 {
            return Err(CardDavError::Unavailable);
        }
        xml::parse(response.body())
    }
}
