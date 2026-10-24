use quick_xml::events::Event;
use quick_xml::name::ResolveResult;
use quick_xml::reader::NsReader;

use super::CardDavError;

const DAV: &str = "DAV:";
const CARD: &str = "urn:ietf:params:xml:ns:carddav";
const MAX_XML_BYTES: usize = 4 * 1024 * 1024;
const MAX_NODES: usize = 60_000;
const MAX_DEPTH: usize = 32;

#[derive(Default)]
pub(super) struct Properties {
    pub principal: Option<String>,
    pub homes: Vec<String>,
    pub addressbook: bool,
    pub collection: bool,
    pub display_name: Option<String>,
    pub etag: Option<String>,
    pub card: Option<String>,
}

pub(super) struct Response {
    pub href: String,
    pub status: Option<u16>,
    pub properties: Vec<(u16, Properties)>,
}

pub(super) struct Multistatus {
    pub responses: Vec<Response>,
    pub token: Option<String>,
}

struct Node {
    namespace: String,
    name: String,
    text: String,
    children: Vec<Node>,
}

impl Node {
    fn is(&self, namespace: &str, name: &str) -> bool {
        self.namespace == namespace && self.name == name
    }

    fn children_named<'a>(
        &'a self,
        namespace: &'a str,
        name: &'a str,
    ) -> impl Iterator<Item = &'a Node> {
        self.children
            .iter()
            .filter(move |node| node.is(namespace, name))
    }

    fn one(&self, namespace: &str, name: &str) -> Result<Option<&Node>, CardDavError> {
        let mut found = self.children.iter().filter(|node| node.is(namespace, name));
        let first = found.next();
        if found.next().is_some() {
            return Err(CardDavError::MalformedResponse);
        }
        Ok(first)
    }

    fn value(&self) -> Result<String, CardDavError> {
        if !self.children.is_empty() {
            return Err(CardDavError::MalformedResponse);
        }
        Ok(self.text.clone())
    }
}

pub(super) fn parse(bytes: &[u8]) -> Result<Multistatus, CardDavError> {
    let root = document(bytes)?;
    if !root.is(DAV, "multistatus") {
        return Err(CardDavError::MalformedResponse);
    }
    if root
        .children
        .iter()
        .any(|node| node.name == "response" && node.namespace != DAV)
    {
        return Err(CardDavError::MalformedResponse);
    }
    let token = root.one(DAV, "sync-token")?.map(Node::value).transpose()?;
    if token
        .as_ref()
        .is_some_and(|token| token.is_empty() || token.len() > 4096)
    {
        return Err(CardDavError::MalformedResponse);
    }
    let responses: Vec<Response> = root
        .children_named(DAV, "response")
        .map(response)
        .collect::<Result<_, _>>()?;
    if responses.len() > 10_000 {
        return Err(CardDavError::ResponseLimit);
    }
    Ok(Multistatus { responses, token })
}

pub(super) fn invalid_token(bytes: &[u8]) -> bool {
    document(bytes).is_ok_and(|root| {
        root.is(DAV, "error")
            && root
                .children
                .iter()
                .any(|node| node.is(DAV, "valid-sync-token"))
    })
}

fn document(bytes: &[u8]) -> Result<Node, CardDavError> {
    if bytes.len() > MAX_XML_BYTES {
        return Err(CardDavError::ResponseLimit);
    }
    let mut reader = NsReader::from_reader(bytes);
    reader.config_mut().expand_empty_elements = true;
    reader.resolver_mut().set_max_declarations_per_element(32);
    let mut stack: Vec<Node> = Vec::new();
    let mut root = None;
    let mut count = 0;
    loop {
        let (namespace, event) = reader
            .read_resolved_event()
            .map_err(|_| CardDavError::MalformedResponse)?;
        match event {
            Event::Start(element) => {
                count += 1;
                if count > MAX_NODES || stack.len() >= MAX_DEPTH {
                    return Err(CardDavError::ResponseLimit);
                }
                let namespace = match namespace {
                    ResolveResult::Bound(namespace) => std::str::from_utf8(namespace.as_ref())
                        .map_err(|_| CardDavError::MalformedResponse)?
                        .to_owned(),
                    ResolveResult::Unbound => String::new(),
                    ResolveResult::Unknown(_) => return Err(CardDavError::MalformedResponse),
                };
                let name = std::str::from_utf8(element.local_name().as_ref())
                    .map_err(|_| CardDavError::MalformedResponse)?
                    .to_owned();
                stack.push(Node {
                    namespace,
                    name,
                    text: String::new(),
                    children: Vec::new(),
                });
            }
            Event::End(_) => {
                let node = stack.pop().ok_or(CardDavError::MalformedResponse)?;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(node);
                } else if root.replace(node).is_some() {
                    return Err(CardDavError::MalformedResponse);
                }
            }
            Event::Text(text) => append(
                &mut stack,
                &text.decode().map_err(|_| CardDavError::MalformedResponse)?,
            )?,
            Event::CData(text) => append(
                &mut stack,
                &text.decode().map_err(|_| CardDavError::MalformedResponse)?,
            )?,
            Event::GeneralRef(reference) => {
                let reference = format!(
                    "&{};",
                    reference
                        .decode()
                        .map_err(|_| CardDavError::MalformedResponse)?
                );
                let value = quick_xml::escape::unescape(&reference)
                    .map_err(|_| CardDavError::MalformedResponse)?;
                append(&mut stack, &value)?;
            }
            Event::DocType(_) | Event::PI(_) => return Err(CardDavError::MalformedResponse),
            Event::Eof => break,
            Event::Decl(_) | Event::Comment(_) => {}
            Event::Empty(_) => return Err(CardDavError::MalformedResponse),
        }
    }
    if !stack.is_empty() {
        return Err(CardDavError::MalformedResponse);
    }
    root.ok_or(CardDavError::MalformedResponse)
}

fn append(stack: &mut [Node], value: &str) -> Result<(), CardDavError> {
    if let Some(node) = stack.last_mut() {
        node.text.push_str(value);
    } else if !value.trim().is_empty() {
        return Err(CardDavError::MalformedResponse);
    }
    Ok(())
}

fn response(node: &Node) -> Result<Response, CardDavError> {
    let href = node
        .one(DAV, "href")?
        .ok_or(CardDavError::MalformedResponse)?
        .value()?;
    if href.is_empty() || href.len() > 4096 {
        return Err(CardDavError::MalformedResponse);
    }
    let status = node.one(DAV, "status")?.map(status).transpose()?;
    let mut properties = Vec::new();
    for propstat in node.children_named(DAV, "propstat") {
        let status = status_of(propstat)?;
        let prop = propstat
            .one(DAV, "prop")?
            .ok_or(CardDavError::MalformedResponse)?;
        let mut values = Properties {
            principal: prop
                .one(DAV, "current-user-principal")?
                .map(required_href)
                .transpose()?,
            ..Properties::default()
        };
        if let Some(homes) = prop.one(CARD, "addressbook-home-set")? {
            values.homes = homes
                .children_named(DAV, "href")
                .map(Node::value)
                .collect::<Result<_, _>>()?;
        }
        if let Some(types) = prop.one(DAV, "resourcetype")? {
            values.addressbook = types.one(CARD, "addressbook")?.is_some();
            values.collection = types.one(DAV, "collection")?.is_some();
        }
        values.display_name = prop.one(DAV, "displayname")?.map(Node::value).transpose()?;
        values.etag = prop.one(DAV, "getetag")?.map(Node::value).transpose()?;
        values.card = prop
            .one(CARD, "address-data")?
            .map(Node::value)
            .transpose()?;
        properties.push((status, values));
    }
    Ok(Response {
        href,
        status,
        properties,
    })
}

fn required_href(node: &Node) -> Result<String, CardDavError> {
    node.one(DAV, "href")?
        .ok_or(CardDavError::MalformedResponse)?
        .value()
}

fn status_of(node: &Node) -> Result<u16, CardDavError> {
    status(
        node.one(DAV, "status")?
            .ok_or(CardDavError::MalformedResponse)?,
    )
}

fn status(node: &Node) -> Result<u16, CardDavError> {
    let mut fields = node.text.split_ascii_whitespace();
    let protocol = fields.next().ok_or(CardDavError::MalformedResponse)?;
    if !matches!(protocol, "HTTP/1.0" | "HTTP/1.1" | "HTTP/2") {
        return Err(CardDavError::MalformedResponse);
    }
    let value = fields
        .next()
        .ok_or(CardDavError::MalformedResponse)?
        .parse()
        .map_err(|_| CardDavError::MalformedResponse)?;
    if !(100..600).contains(&value) {
        return Err(CardDavError::MalformedResponse);
    }
    Ok(value)
}
