# Barcode pillar

`@pops/barcode` is the credentialled ISBN lookup service. It validates and
normalises a scanned code, asks injected book-source adapters for a product,
and caches complete products and misses in its own SQLite database.

The lookup uses Open Library followed by Google Books without changing this
pillar's contract or lookup policy. A hit missing author or language metadata
is enriched from later providers and is returned without a long-lived cache
entry when enrichment remains incomplete. Open Library also falls back to its
ISBN search index when an edition record has no usable author links.

Every valid request still returns HTTP 200 with `found`, `not_found`, or
`unavailable`. The latter may carry an ADR-054 `error` envelope with a safe
code, message, request ID, and retry decision. A valid non-book barcode returns
`not_found` with optional reason `unsupported`; an ordinary provider miss has
no reason. Both additions are optional so consumers generated from the earlier
union remain compatible.

Provider attempts and final lookup outcomes emit structured events keyed by
the propagated request ID. They include source, duration, outcome, and safe
failure class. They never include the scanned code, credentials, provider
payloads, or exception text.

Every valid request still returns HTTP 200 with `found`, `not_found`, or
`unavailable`. The latter may carry an ADR-054 `error` envelope with a safe
code, message, request ID, and retry decision. A valid non-book barcode returns
`not_found` with optional reason `unsupported`; an ordinary provider miss has
no reason. Both additions are optional so consumers generated from the earlier
union remain compatible.

Provider attempts and final lookup outcomes emit structured events keyed by
the propagated request ID. They include source, duration, outcome, and safe
failure class. They never include the scanned code, credentials, provider
payloads, or exception text.

This pillar does not scan camera frames, map book metadata onto an inventory
type, broadcast events, download image bytes, or own inventory data. Consumers
send a code to `GET /lookup/:code` and decide how a returned product should be
used.

Run it locally with:

```bash
pnpm install
pnpm dev
```

The lookup route requires an `X-API-Key` service-account credential with the
`barcode.lookup` scope. `/health`, `/pillars`, and `/openapi` remain open for
service discovery and container probes.

Configuration:

- `BARCODE_USER_AGENT_CONTACT` is required and is sent with Open Library
  requests as part of the identifying `User-Agent`.
- `BARCODE_GOOGLE_BOOKS_API_KEY_FILE` names a mounted file containing the
  optional Google Books API key. It takes precedence over
  `BARCODE_GOOGLE_BOOKS_API_KEY`.
- `BARCODE_GOOGLE_BOOKS_API_KEY` is the local-development fallback. When both
  Google Books key variables are absent, Google Books is reported as
  unavailable rather than as a source miss.
