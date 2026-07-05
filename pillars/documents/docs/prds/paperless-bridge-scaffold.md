# Paperless Bridge Scaffold

> Theme: [Documents](../README.md)

## Overview

Stand up `pillars/documents` as a bridge pillar (ADR-035) that owns the
paperless-ngx integration, and move the paperless-ngx HTTP client, its ts-rest
contract, and its handlers out of `inventory` (ADR-039 workstream 13). This is
a source-only scaffold: it moves code and wires `inventory` to call the new
pillar over `@pops/pillar-sdk`. It does **not** wire the paperless-ngx /
paperless-redis containers, networks, volumes, or secrets in
`infra/docker-compose.yml` — that prod cutover is a separate, later,
prod-gated step (ADR-039 workstream 22).

## Data Model

None. `documents` owns no domain database — it proxies live to a paperless-ngx
instance for status/search and thumbnail bytes. (Inventory's own
`item_documents` link table — which item links to which Paperless document id
— is unaffected and stays in `inventory`; see
`pillars/inventory/docs/prds/paperless-integration.md`.)

## API Surface

| Method & Path                  | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `GET /paperless/status`        | `{ configured, available, baseUrl }`                                      |
| `GET /paperless/search?query=` | Search paperless-ngx documents; `412` when unconfigured                   |
| `GET /documents/:id/thumbnail` | Raw byte proxy for a document's thumbnail (no OpenAPI surface)            |
| `GET /health`                  | Liveness shape — no DB round-trip                                         |
| `GET /pillars`                 | Registry-first fleet view, prepended with the synthetic `documents` entry |

`inventory` keeps its own identically-shaped `paperless.status` /
`paperless.search` contract (unchanged wire shape, so no frontend or nginx
change); its handler now calls `pillar('documents')` instead of an embedded
client.

## Business Rules

- The paperless-ngx HTTP client, its gating env vars (`PAPERLESS_BASE_URL` /
  `PAPERLESS_API_TOKEN`), and the raw thumbnail proxy live ONLY in `documents`
  — `inventory` holds no reference to them.
- `inventory`'s `paperless.*` handlers degrade gracefully: any non-`ok`
  `pillar('documents')` call result (unavailable, degraded, contract
  mismatch, or the wire `412`) is treated as "not usable" — `status` reports
  `{ configured: false, available: false, baseUrl: null }`, `search` returns
  the same `412` it always has. No new error states reach the frontend.
- `inventory`'s raw thumbnail proxy resolves `documents`'s `baseUrl` via
  `@pops/pillar-sdk/discovery`'s `lookupPillar` and streams bytes from
  `documents`'s own thumbnail route — a double proxy (browser → inventory →
  documents → paperless-ngx) so inventory's frontend keeps hitting its own
  backend unchanged.
- `documents` self-registers with the `registry` pillar on boot
  (`POPS_REGISTRY_ENABLED`), like every other pillar.

## Edge Cases

| Case                                                 | Behaviour                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `documents` unregistered / unreachable               | `inventory.paperless.status` → not-configured shape; `search` → 412; thumbnail proxy → 503 |
| `documents` reachable but paperless-ngx unconfigured | Same 412 / not-configured shape as before the move (behavior-preserving)                   |
| `documents` reachable, paperless-ngx down            | `status.available: false`; thumbnail proxy → 502                                           |

## Acceptance Criteria

- [x] `pillars/documents` exists as a self-contained package (`@pops/documents`), with its own `mise.toml`, `Dockerfile`, `tsconfig.json`, `vitest.config.ts`.
- [x] `documents` exports a ts-rest contract (`paperless.status`, `paperless.search`) and projects it to a committed `openapi/documents.openapi.json`, served verbatim at `GET /openapi`.
- [x] `documents` self-registers with the `registry` pillar on boot via `bootstrapPillar`, with a manifest that validates against `validateManifestPayload`.
- [x] The paperless-ngx HTTP client (`PaperlessClient`), its types, and its factory moved from `pillars/inventory/src/api/modules/paperless/` to `pillars/documents/src/api/modules/paperless/`.
- [x] The raw thumbnail byte-proxy route moved to `documents` (`GET /documents/:id/thumbnail`).
- [x] `inventory` no longer imports or references the moved paperless module (`grep -r "modules/paperless" pillars/inventory/src` after the move returns comment references only, no imports).
- [x] `inventory`'s `paperless.*` handlers call `pillar('documents')` via a `DocumentsClient` seam, with production defaulting to the live SDK proxy and tests injecting a stub.
- [x] `inventory`'s thumbnail proxy resolves `documents` via pillar discovery and proxies bytes, with an injectable discovery/fetch seam for tests.
- [x] `inventory`'s own `paperless.*` OpenAPI projection is byte-identical before and after the move (`pnpm -F @pops/inventory generate:openapi && git diff --exit-code` — no drift).
- [x] Both pillars pass `typecheck`, `test`, `lint` (oxlint), `format` (oxfmt), and module-boundaries (`depcruise`) scoped to their changed dirs.
- [x] No `infra/docker-compose*.yml`, network, volume, or secret changes — this PRD is source-only.

## Out of Scope

- Wiring the paperless-ngx / paperless-redis containers, networks, volumes, secrets, and per-pillar backup in `infra/docker-compose.yml` (ADR-039 workstream 22 — a separate, prod-gated PR after backups + the homelab-infra reconcile land).
- Populating `documents`'s `search.adapters` / `ai.tools` manifest dimensions (would require mirroring document metadata locally instead of proxying live on every call).
- Any change to `inventory`'s frontend, its `item_documents` link table, or its `documentFiles` direct-upload surface.
