# Barcode pillar

`@pops/barcode` is the credentialled ISBN lookup service. It validates and
normalises a scanned code, asks injected book-source adapters for a product,
and caches successful products and misses in its own SQLite database.

The lookup uses Open Library followed by Google Books without changing this
pillar's contract or lookup policy.

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
