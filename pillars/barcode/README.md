# Barcode pillar

`@pops/barcode` is the credentialled ISBN lookup service. It validates and
normalises a scanned code, asks injected book-source adapters for a product,
and caches successful products and misses in its own SQLite database.

The first increment deliberately contains no provider adapters. POPS-4915 adds
Open Library and Google Books implementations without changing this pillar's
contract or lookup policy.

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
