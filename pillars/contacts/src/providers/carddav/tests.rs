use super::*;
use crate::providers::transport::{ProviderResponseFuture, TransportError};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub(super) const BOOK: &str = "https://p01-contacts.icloud.com/fictional/carddav/book/";
pub(super) const ONE: &str = "https://p01-contacts.icloud.com/fictional/carddav/book/one.vcf";
pub(super) const TWO: &str = "https://p01-contacts.icloud.com/fictional/carddav/book/two.vcf";

pub(super) struct Step {
    method: &'static str,
    url: String,
    contains: Vec<String>,
    excludes: Vec<String>,
    response: Result<ProviderResponse, TransportError>,
}

impl Step {
    pub(super) fn xml(method: &'static str, url: &str, status: u16, body: &str) -> Self {
        Self {
            method,
            url: url.to_owned(),
            contains: Vec::new(),
            excludes: Vec::new(),
            response: ProviderResponse::new(
                reqwest::StatusCode::from_u16(status).unwrap(),
                HeaderMap::new(),
                body.as_bytes().to_vec(),
            ),
        }
    }

    pub(super) fn containing(mut self, value: &str) -> Self {
        self.contains.push(value.to_owned());
        self
    }
    pub(super) fn excluding(mut self, value: &str) -> Self {
        self.excludes.push(value.to_owned());
        self
    }
    pub(super) fn failed(url: &str) -> Self {
        Self {
            method: "REPORT",
            url: url.to_owned(),
            contains: Vec::new(),
            excludes: Vec::new(),
            response: Err(TransportError::Unavailable),
        }
    }
}

#[derive(Clone)]
pub(super) struct Fake(Arc<Mutex<VecDeque<Step>>>);

impl Fake {
    pub(super) fn new(steps: Vec<Step>) -> Self {
        Self(Arc::new(Mutex::new(steps.into())))
    }
    pub(super) fn done(&self) {
        assert!(self.0.lock().unwrap().is_empty());
    }
}

impl ProviderTransport for Fake {
    fn send<'a>(&'a self, request: ProviderRequest<'a>) -> ProviderResponseFuture<'a> {
        Box::pin(async move {
            let step = self
                .0
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected request");
            assert_eq!(request.method.as_str(), step.method);
            assert_eq!(request.url, step.url);
            assert!(request.authorization.is_some());
            assert_eq!(request.origin, ProviderOrigin::Icloud);
            ProviderOrigin::Icloud.validate(request.url).unwrap();
            assert!(matches!(request.method.as_str(), "PROPFIND" | "REPORT"));
            let body = std::str::from_utf8(request.body.unwrap().expose()).unwrap();
            for fragment in step.contains {
                assert!(
                    body.contains(&fragment),
                    "missing fictional request fragment"
                );
            }
            for fragment in step.excludes {
                assert!(
                    !body.contains(&fragment),
                    "unexpected fictional request fragment"
                );
            }
            step.response
        })
    }
}

pub(super) fn authorization() -> SecretBytes {
    SecretBytes::new(b"Basic fictional-test-only".to_vec()).unwrap()
}

pub(super) fn book() -> CardDavCollection {
    CardDavCollection {
        key: BOOK.to_owned(),
        display_name: Some("Fictional".to_owned()),
    }
}

pub(super) fn multi(responses: &str, token: Option<&str>) -> String {
    format!("<d:multistatus xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:carddav\">{responses}{}</d:multistatus>", token.map(|token| format!("<d:sync-token>{}</d:sync-token>", xml_text(token))).unwrap_or_default())
}

pub(super) fn properties(href: &str, fields: &str) -> String {
    format!("<d:response><d:href>{}</d:href><d:propstat><d:prop>{fields}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>", xml_text(href))
}

pub(super) fn status(href: &str, status: u16) -> String {
    format!("<d:response><d:href>{}</d:href><d:status>HTTP/1.1 {status} Fictional</d:status></d:response>", xml_text(href))
}

pub(super) fn listed(href: &str, etag: &str) -> String {
    properties(
        href,
        &format!("<d:getetag>{}</d:getetag><d:resourcetype/>", xml_text(etag)),
    )
}

pub(super) fn card(href: &str, etag: &str, uid: &str) -> String {
    let card = format!("BEGIN:VCARD\nVERSION:3.0\nFN:Fictional Example\nN:Example;Fictional;;;\nUID:{uid}\nEMAIL:fictional@example.test\nEND:VCARD\n");
    properties(
        href,
        &format!(
            "<d:getetag>{}</d:getetag><c:address-data>{}</c:address-data>",
            xml_text(etag),
            xml_text(&card)
        ),
    )
}

#[tokio::test]
async fn discovery_revalidates_all_hrefs_and_accepts_namespace_aliases() {
    let principal = "https://p01-contacts.icloud.com/fictional/principal/";
    let home = "https://p01-contacts.icloud.com/fictional/carddav/";
    let fake = Fake::new(vec![
        Step::xml("PROPFIND", "https://contacts.icloud.com/", 207, &multi(&properties("/", &format!("<d:current-user-principal><d:href>{principal}</d:href></d:current-user-principal>")), None)).containing("current-user-principal"),
        Step::xml("PROPFIND", principal, 207, &multi(&properties(principal, "<c:addressbook-home-set><d:href>/fictional/carddav/</d:href></c:addressbook-home-set>"), None)),
        Step::xml("PROPFIND", home, 207, &multi(&(properties(home, "<d:resourcetype><d:collection/></d:resourcetype>") + &properties(BOOK, "<d:resourcetype><d:collection/><c:addressbook/></d:resourcetype><d:displayname>Fictional &amp; Book</d:displayname>")), None)),
    ]);
    let books = CardDavAdapter::new(fake.clone())
        .discover(&authorization())
        .await
        .unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].key, BOOK);
    assert_eq!(books[0].display_name.as_deref(), Some("Fictional & Book"));
    fake.done();
}

#[tokio::test]
async fn account_discovery_uses_authenticated_principal_instead_of_labels() {
    let mut accounts = Vec::new();
    for name in ["first", "second"] {
        let principal = format!("https://contacts.icloud.com/{name}/principal/");
        let home = "https://p01-contacts.icloud.com/fictional/carddav/";
        let fake = Fake::new(vec![
            Step::xml("PROPFIND", "https://contacts.icloud.com/", 207, &multi(&properties("/", &format!("<d:current-user-principal><d:href>/{name}/principal/</d:href></d:current-user-principal>")), None)),
            Step::xml("PROPFIND", &principal, 207, &multi(&properties(&principal, &format!("<c:addressbook-home-set><d:href>{home}</d:href></c:addressbook-home-set>")), None)),
            Step::xml("PROPFIND", home, 207, &multi(&(properties(home, "<d:resourcetype><d:collection/></d:resourcetype>") + &properties(BOOK, "<d:resourcetype><d:collection/><c:addressbook/></d:resourcetype><d:displayname>Same fictional label</d:displayname>")), None)),
        ]);
        let account = CardDavAdapter::new(fake.clone())
            .discover_account(&authorization())
            .await
            .unwrap();
        assert!(account.principal_key == principal);
        accounts.push(account);
        fake.done();
    }
    assert!(accounts[0].principal_key != accounts[1].principal_key);
    assert!(accounts[0].collections == accounts[1].collections);
}

#[tokio::test]
async fn discovery_refuses_unapproved_authentication_targets_before_requesting() {
    for href in [
        "https://example.test/steal",
        "http://contacts.icloud.com/",
        "https://fictional@contacts.icloud.com/",
        "https://p01-contacts.icloud.com/book/?secret=fictional",
        "https://p01-contacts.icloud.com.evil.test/",
    ] {
        let fake = Fake::new(vec![Step::xml(
            "PROPFIND",
            "https://contacts.icloud.com/",
            207,
            &multi(
                &properties(
                    "/",
                    &format!(
                        "<d:current-user-principal><d:href>{}</d:href></d:current-user-principal>",
                        xml_text(href)
                    ),
                ),
                None,
            ),
        )]);
        let result = CardDavAdapter::new(fake.clone())
            .discover(&authorization())
            .await;
        assert!(matches!(result, Err(CardDavError::Transport)));
        fake.done();
    }
}

#[tokio::test]
async fn discovery_rejects_failed_propstats_and_redirects() {
    for (code, body, expected) in [
        (302, "", CardDavError::Transport),
        (401, "", CardDavError::Unauthorized),
        (429, "", CardDavError::RetryLater),
        (503, "", CardDavError::RetryLater),
        (500, "", CardDavError::Unavailable),
    ] {
        let fake = Fake::new(vec![Step::xml(
            "PROPFIND",
            "https://contacts.icloud.com/",
            code,
            body,
        )]);
        let result = CardDavAdapter::new(fake.clone())
            .discover(&authorization())
            .await;
        assert!(matches!(result, Err(error) if error == expected));
        fake.done();
    }
    let failed = multi(
        &properties(
            "/",
            "<d:current-user-principal><d:href>/fictional/</d:href></d:current-user-principal>",
        )
        .replace("200 OK", "404 Missing"),
        None,
    );
    let fake = Fake::new(vec![Step::xml(
        "PROPFIND",
        "https://contacts.icloud.com/",
        207,
        &failed,
    )]);
    assert!(matches!(
        CardDavAdapter::new(fake.clone())
            .discover(&authorization())
            .await,
        Err(CardDavError::Unavailable)
    ));
    fake.done();
}

#[tokio::test]
async fn discovery_requires_complete_successful_home_evidence() {
    let home = "https://p01-contacts.icloud.com/fictional/carddav/";
    let self_response = properties(home, "<d:resourcetype><d:collection/></d:resourcetype>");
    let book_response = properties(
        BOOK,
        "<d:resourcetype><d:collection/><c:addressbook/></d:resourcetype>",
    );
    let missing_type = properties(BOOK, "<d:displayname>Fictional</d:displayname>");
    let failed_type = book_response.replace("200 OK", "403 Forbidden");
    let failed_optional = format!("<d:response><d:href>{BOOK}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:addressbook/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:displayname/></d:prop><d:status>HTTP/1.1 404 Missing</d:status></d:propstat></d:response>");
    for (listing, expected) in [
        (multi("", None), None),
        (multi(&book_response, None), None),
        (multi(&properties(home, "<d:resourcetype/>"), None), None),
        (
            multi(&self_response.replace("200 OK", "403 Forbidden"), None),
            None,
        ),
        (multi(&(self_response.clone() + &missing_type), None), None),
        (multi(&(self_response.clone() + &failed_type), None), None),
        (
            multi(&(self_response.clone() + &status(BOOK, 403)), None),
            None,
        ),
        (
            multi(
                &(self_response.clone() + &book_response + &book_response),
                None,
            ),
            None,
        ),
        (
            multi(
                &(self_response.clone()
                    + &properties(BOOK, "<d:resourcetype><c:addressbook/></d:resourcetype>")),
                None,
            ),
            None,
        ),
        (
            format!("<d:multistatus xmlns:d=\"DAV:\">{self_response}"),
            None,
        ),
        (multi(&self_response, None), Some(0)),
        (multi(&(self_response + &failed_optional), None), Some(1)),
    ] {
        let principal = "https://p01-contacts.icloud.com/fictional/principal/";
        let fake = Fake::new(vec![
            Step::xml("PROPFIND", "https://contacts.icloud.com/", 207, &multi(&properties("/", &format!("<d:current-user-principal><d:href>{principal}</d:href></d:current-user-principal>")), None)),
            Step::xml("PROPFIND", principal, 207, &multi(&properties(principal, &format!("<c:addressbook-home-set><d:href>{home}</d:href></c:addressbook-home-set>")), None)),
            Step::xml("PROPFIND", home, 207, &listing),
        ]);
        let result = CardDavAdapter::new(fake.clone())
            .discover(&authorization())
            .await;
        match expected {
            Some(count) => assert_eq!(result.unwrap().len(), count),
            None => assert!(result.is_err()),
        }
        fake.done();
    }
}

#[tokio::test]
async fn discovery_rejects_partial_home_set_evidence_before_listing() {
    let principal = "https://p01-contacts.icloud.com/fictional/principal/";
    let homes = properties(
        principal,
        "<c:addressbook-home-set><d:href>/fictional/carddav/</d:href></c:addressbook-home-set>",
    ) + &properties(
        principal,
        "<c:addressbook-home-set><d:href>/fictional/other/</d:href></c:addressbook-home-set>",
    )
    .replace("200 OK", "403 Forbidden");
    let fake = Fake::new(vec![
        Step::xml("PROPFIND", "https://contacts.icloud.com/", 207, &multi(&properties("/", &format!("<d:current-user-principal><d:href>{principal}</d:href></d:current-user-principal>")), None)),
        Step::xml("PROPFIND", principal, 207, &multi(&homes, None)),
    ]);
    assert!(matches!(
        CardDavAdapter::new(fake.clone())
            .discover(&authorization())
            .await,
        Err(CardDavError::Unavailable)
    ));
    fake.done();
}
