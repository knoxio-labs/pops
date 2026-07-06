# Documents

`@pops/documents` is the bridge pillar (ADR-035) that owns the paperless-ngx
integration. It listens on port **3012**, owns **no database**, and proxies
live to a paperless-ngx instance for both its status/search REST contract and
its thumbnail byte proxy.

## Why this pillar exists

Before this pillar existed, paperless-ngx was embedded directly inside
`inventory`: a `PaperlessClient` HTTP wrapper, a `paperless.*` ts-rest
contract, and a raw thumbnail-proxy route all lived under
`pillars/inventory/src/api/`. The 2026-07-05 pillar-isolation coupling audit
([ADR-039](../../../docs/architecture/adr-039-pillar-isolation.md)) flagged
this as an orphaned integration: no owning pillar, no network-reachability
plan, no backup story, and env vars (`PAPERLESS_BASE_URL` /
`PAPERLESS_API_TOKEN`) that were never wired in the production compose file
— the feature silently 412s in prod.

This pillar (ADR-039 workstream 13) gives paperless-ngx a single owner. It is
a **source-only scaffold**: the paperless module, its contract, and its
handlers moved here; `inventory` now calls this pillar over
`@pops/pillar-sdk`'s `pillar('documents')` proxy instead of embedding the
client directly. Wiring the actual paperless-ngx + paperless-redis
containers, networks, volumes, secrets, and backup is a separate, later,
prod-gated step (workstream 22).

## Surface

| Surface                        | What it does                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET /paperless/status`        | `{ configured, available, baseUrl }` — whether paperless-ngx is configured (env present) and currently reachable. |
| `GET /paperless/search?query=` | Search paperless-ngx documents by query string. Returns `412` when the integration is unconfigured.               |
| `GET /documents/:id/thumbnail` | Raw byte proxy for a document's thumbnail image (not a ts-rest contract route — no OpenAPI surface).              |
| `GET /health`                  | Pure liveness shape (`{ ok, status, pillar, version, ts }`). No DB round-trip — there is no DB.                   |
| `GET /pillars`                 | Registry-first view of the fleet, prepended with the synthetic `documents` self-entry.                            |

## How inventory consumes this pillar

`inventory` keeps its own identically-shaped `paperless.status` /
`paperless.search` REST contract for its frontend (no frontend-facing or
nginx-routing change was needed), but its handler implementation now calls
`pillar('documents')` (`@pops/pillar-sdk` `pillar()` proxy) instead of
embedding a `PaperlessClient`. See
`pillars/inventory/src/api/documents/client.ts`. Any failure (documents
unreachable, degraded, or not yet registered) degrades to the same "not
configured" shape the frontend already handles — no new error states in the
inventory app.

Inventory's raw thumbnail-proxy route (`GET
/inventory/documents/:id/thumbnail`) similarly now resolves `documents`'s
`baseUrl` via `@pops/pillar-sdk/discovery`'s `lookupPillar` and streams the
proxied bytes from `GET /documents/:id/thumbnail` on this pillar, rather than
holding its own `PaperlessClient`.

## Manifest

Declares empty `search`/`ai`/`uri` manifest dimensions in this increment — a
future increment can populate `search.adapters` (so paperless documents show
up in federated search) or `ai.tools` (so cerebrum can search documents on
request) once the pillar mirrors document metadata locally instead of
proxying live on every call, per the [bridge pillar
idea](../../../docs/ideas/bridge-pillars.md) pattern.

## PRD Index

| PRD                                                            | Summary                                                                                       | Status |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| [Paperless Bridge Scaffold](prds/paperless-bridge-scaffold.md) | Scaffold the pillar; move the paperless-ngx client, contract, and handlers out of `inventory` | Done   |

## Related

- [ADR-035](../../../docs/architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — bridge pillar kind
- [ADR-039](../../../docs/architecture/adr-039-pillar-isolation.md) — the pillar-isolation program this pillar's scaffold is workstream 13 of
- [bridge-pillars idea](../../../docs/ideas/bridge-pillars.md) — the bridge-pillar shape this pillar follows
