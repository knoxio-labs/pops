# ADR-055: A books-only barcode lookup pillar for v1

## Status

Accepted — 2026-09-26. Introduces the standalone `barcode` pillar's v1 contract for ISBN lookup (POPS-4913, POPS-4229).

## Context

Inventory's scan-to-prefill flow needs one server-side lookup surface that can turn a scanned ISBN into metadata without coupling the inventory client to a provider's response shape. The first release needs book coverage for ISBN scans; it does not need to claim that every product barcode is a book or that a single provider is always available.

The decision to make this a standalone pillar, and the failure semantics that distinguish a provider miss from a provider outage, were settled in POPS-4229. This ADR records those decisions for the v1 contract and narrows the source set to books so the inventory scan-to-prefill work has a usable ISBN lookup. It does not reopen the standalone-pillar decision or make an outage look like a miss for the sake of a simpler client.

## Decision

**The `barcode` service is a standalone, credentialled pillar whose v1 lookup sources are Open Library followed by Google Books. V1 supports books only.** The pillar owns one SQLite cache table keyed by the normalised code; it does not share the inventory database or persist source-specific records.

### Contract

The ts-rest router has one top-level key and one route:

```text
lookup.get: GET /lookup/:code
```

Every valid request returns HTTP 200 with this discriminated union:

```json
{ "outcome": "found", "product": { "...": "..." } }
{ "outcome": "not_found" }
{ "outcome": "unavailable" }
```

An invalid code returns HTTP 400 with the `barcode.lookup.invalid_code` error. Validation happens before cache access or source requests. The health endpoint remains open; the lookup route is credentialled as described below.

The normalised product is:

```ts
{
  code: string;
  kind: 'book';
  title: string;
  subtitle?: string;
  contributors: Array<{ name: string; role?: string }>;
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
  description?: string;
  subjects: string[];
  imageUrls: string[];
  source: 'open_library' | 'google_books';
  fetchedAt: string;
  attributes: Record<string, string>;
}
```

`publishedDate` keeps the most precise source value that matches `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `fetchedAt` is an ISO timestamp written by the pillar. `attributes` is for descriptive facts that do not have a first-class field in this contract.

Identifiers never appear in `attributes`. Open Library's `isbn_10`, `isbn_13`, `identifiers`, `lccn` and `oclc_numbers`, and Google Books' `industryIdentifiers` are discarded. The only identifier exposed by the product is `code`. This prevents a provider's identifier vocabulary from becoming an accidental cross-pillar contract.

`imageUrls` contains URLs only. The barcode pillar does not download, proxy, or cache image bytes. A consumer that chooses to keep an image copies the bytes itself and owns that storage and its provider terms. This is a new barcode rule; [ADR-042](adr-042-purchase-documents-and-transaction-reconciliation.md) governs purchase documents, not image retention.

### Validation and normalisation

The pillar first removes spaces and hyphens from the path value. It returns `barcode.lookup.invalid_code` with HTTP 400 if the resulting value:

- contains a non-digit, except a trailing `X` in a ten-character ISBN-10;
- is not 8, 10, 12 or 13 characters long; or
- fails its check digit: ISBN-10 uses mod-11 and EAN/UPC uses mod-10.

An ISBN-10 is converted to its ISBN-13 form before cache lookup and source access. A valid EAN-13 beginning with `978` or `979` is treated as a book ISBN. Other valid 8-, 12- or 13-digit codes are valid barcodes but are outside the v1 book route and return `not_found` without calling a source.

### Outcomes and failure semantics

For a book code, sources are queried in order and the first source that answers with a hit wins. A source miss is a successful response that contains no matching book. A source error, timeout, rate-limit or quota response is unavailable.

- `found` is returned as soon as a source answers with a product, even if an earlier source was unavailable.
- `not_found` is returned only when every applicable source answered a miss, or when the valid code is outside the `978`/`979` book route.
- `unavailable` is returned when there is no hit and at least one applicable source was unavailable, or when the shared lookup budget expires. An unavailable source is never converted into a miss.

This makes a provider outage visible to the inventory client and permits a later retry. It also means a missing Google Books API key is unavailable when Google is needed, not a cached `not_found`.

### Authentication and scopes

The service uses the service-account scope gate with `rootScope: 'barcode'`. The route's derived scope is therefore `barcode.lookup.get`, and a caller is granted the dotted prefix `barcode.lookup`. Scope names remain dotted; a bare `barcode` grant is not valid for this route.

`barcode` sets `requireCredential: true`, deliberately differing from the fleet default used by inventory for browser callers. There is no browser caller for this service: inventory and bfm call it server-to-server, so requiring a service-account credential closes the route rather than breaking a public frontend. `/health` is the sole open endpoint.

### Time budgets

The pillar creates one deadline per lookup. The total budget is 8 seconds, and no individual source HTTP request may run longer than 4 seconds. Source requests receive the remaining deadline signal and v1 does not queue or retry rate-limited work inside the request.

bfm gives its call to the barcode pillar a 10-second budget. That outer budget includes transport and the barcode pillar's 8-second source budget; it is not permission for a source adapter to start a second 8-second window.

### Sources and provider terms

| Order | Source       | Access                                                                                                                                                                      | Rate limits and failure handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Caching and storage terms                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Checked    |
| ----- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Open Library | `GET https://openlibrary.org/isbn/{isbn13}.json`, using the documented ISBN JSON representation.                                                                            | The [Open Library API guidance](https://openlibrary.org/developers/api) publishes 1 request/sec for unidentified requests and 3 requests/sec for identified requests. The client sends an application name and contact in `User-Agent`, using `BARCODE_USER_AGENT_CONTACT`, in the documented form such as `MyLibraryApp (contact@example.org)`. A 429 or other provider failure is `unavailable`; v1 does not queue requests.                                                                                                                                                       | Open Library asks clients to cache responses whenever possible, does not permit bulk harvesting or use as high-traffic backend infrastructure, and states that the database has no new copyright or proprietary rights asserted by the Internet Archive in its [licensing guidance](https://openlibrary.org/developers/licensing). The pillar performs human-triggered, low-volume lookups and stores only the normalised product or miss, never a raw provider response. | 2026-09-26 |
| 2     | Google Books | `GET https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn13}&maxResults=1&printType=books`, with `BARCODE_GOOGLE_BOOKS_API_KEY` or `BARCODE_GOOGLE_BOOKS_API_KEY_FILE`. | The [Google Books API guide](https://developers.google.com/books/docs/v1/using) requires public-data requests to identify the application with an API key or OAuth access token. The lookup uses a server API key; it does not work under the documented contract without one. The public Books guide does not publish a fixed Books-specific QPS; the key supplies project quota and Google may enforce limits under the [Google APIs Terms of Service](https://developers.google.com/terms). 429, quota and other provider failures are `unavailable`; v1 does not queue requests. | Google’s terms prohibit building permanent copies or keeping cached API content longer than the response's cache header permits, and require permitted cached content to be deleted when access ends. The source adapter therefore treats the response cache header as the upper bound for any persisted Google-derived entry; a missing or zero permitted age means no Google-derived entry is retained. Provider image bytes are never stored.                          | 2026-09-26 |

Open Library's documented access is public and does not require an API key. Google Books does not have an equivalent keyless path for this service: public requests must carry an API key or OAuth token, so v1 uses the key-only server configuration and treats an absent key as source unavailability.

### Normalised source mapping

Each source adapter maps its response into the product above and drops fields that are not part of the contract. Open Library supplies edition-level title, subtitle, authors, publishers, publication date, page count, subjects, description and cover URLs from its ISBN representation. Google Books supplies the equivalent fields from `volumeInfo`, including authors, publisher, publication date, page count, language, description, categories and image links. Provider-specific identifiers and IDs are never copied into `attributes`.

An adapter may omit a field that is absent, malformed or less precise than the contract permits. It must not invent a title or turn a provider parsing error into a valid product. A source response that cannot be safely mapped is unavailable.

### Cache

The pillar uses one SQLite table keyed by the normalised `code`. The row stores the outcome, the normalised product when present, `fetchedAt`, and `expiresAt`. A `found` row includes its source; a `not_found` row does not include a product. `unavailable` is never inserted or refreshed.

No provider publishes one universal TTL for these ISBN responses, so the following are POPS application upper bounds rather than provider promises:

- `found`: 7 days;
- `not_found`: 24 hours;
- `unavailable`: never.

These are application upper bounds chosen to satisfy the provider guidance: Open Library explicitly asks clients to cache responses and the short negative TTL avoids turning an incomplete catalogue into a durable fact; Google-derived rows are further clamped to the source response's permitted cache age, so the 7-day/24-hour values never override Google's cache header. A source-specific permitted age of zero suppresses persistence for that source. A cache hit is returned only before `expiresAt`; an expired row is treated as a miss and refreshed under the same outcome rules.

### Scope of v1

The following are deliberately not part of this release:

- non-book sources, including Open Food Facts and UPCitemdb; their coverage work and the non-book coverage test remain with POPS-4229 and can extend this contract later;
- queueing, backoff or a background job for provider rate limits;
- barcode capture or event-system integration, including POPS-3214 and POPS-3535.

## Consequences

- Inventory scan-to-prefill receives one stable ISBN product shape and can distinguish an absent book from a provider outage.
- Open Library is the low-cost primary source, while Google Books provides fallback coverage when its configured quota is available.
- The pillar owns provider credentials, rate-limit handling and source-specific field filtering; callers do not need provider keys or schemas.
- The 8-second inner budget and 10-second bfm budget make the unavailable outcome deterministic instead of leaving a request hanging on a provider.
- The cache reduces repeated provider traffic, but the source-specific Google cache-header rule means two otherwise identical products may have different persistence durations depending on the response.
- Adding non-book coverage later is an extension of the outcome and product contract, not a reason to make v1 guess that every valid EAN or UPC is a book.
