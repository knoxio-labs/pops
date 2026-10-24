# iCloud CardDAV adapter

`CardDavAdapter` performs authenticated `PROPFIND` and `REPORT` reads through the
shared provider transport. Discovery starts at `https://contacts.icloud.com/`,
finds the current principal and address-book home, then lists address books.
Every discovered URL passes the transport's fixed iCloud host policy before
credentials accompany another request. Redirects are refused. Collection discovery
requires successful home self-collection proof and an explicit successful resource
type for every returned member; optional display-name failures are tolerated.

`discover_account` also returns the canonical authenticated principal URL.
Management uses this server-derived identity to reject a reconnect to a different
account, even when the submitted username or address-book labels look alike.

`CardDavCredential` holds the account name and app password in zeroizing buffers
without `Debug` or general serialization. It builds Basic authorization only at
the transport boundary. Its versioned binary bundle is plaintext and must be
stored through the shared authenticated credential cipher. Account names are
limited to 1024 UTF-8 bytes and app passwords to 256; empty values, whitespace,
controls and username colons are rejected without normalizing either value.

An address book's absolute URL is its collection key. Each resource's absolute
URL is its record key within that collection; names, email addresses, phone
numbers and vCard ordinals never establish identity. A vCard UID is required and
retained as provider evidence. Moving a resource to a different URL is a removal
and a new source observation; it does not automatically merge people by UID.

`sync_page` accepts the collection's committed checkpoint and an optional opaque
continuation. Continuations bind to the collection and the original checkpoint.
Truncated RFC 6578 responses return a continuation, including during initial
full enumeration. The terminal page offers a checkpoint only after all changed
resources have been fetched at the ETags observed in that page. Missing,
malformed, duplicated or failed per-item responses abort the page. Invalid sync
tokens require an explicit full restart. Unsupported sync reports permit a
bounded full `PROPFIND` fallback; an incremental run must restart first.

The shared coordinator owns durable staging, restart leases, account fencing and
checkpoint writes. A full run must retain every returned seen key, including
unchanged resources skipped through ETag comparison. It may infer removals only
after the entire full enumeration completes. Incremental removals come from
explicit resource `404` responses. A failed page offers no advancing checkpoint.

XML parsing checks expanded namespaces, refuses DTDs and unknown entities, and
bounds bodies to 4 MiB, nesting to 32 levels, namespace declarations to 32 per
element, nodes to 60,000 and response members to 10,000. Individual vCards are
limited to 512 KiB. Multiget requests contain at most 100 resources and 12 KiB of
XML. Tests use fictional responses and an injected transport; they make no
requests to iCloud.
