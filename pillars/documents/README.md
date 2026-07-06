# @pops/documents

The **documents** pillar — a bridge pillar (ADR-035) that owns the
paperless-ngx integration. It has no domain database of its own; it proxies
live to a paperless-ngx instance and exposes a thin REST contract over it.
It listens on port **3012**.

This pillar exists because paperless-ngx was previously an orphaned
integration embedded inside the `inventory` pillar (ADR-039, workstream 13):
no owning pillar, no network reachability plan, no backup story. `documents`
gives it a single owner.

| Surface                        | What it does                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /paperless/status`        | Whether paperless-ngx is configured (env present) and reachable.                       |
| `GET /paperless/search`        | Search paperless-ngx documents by query string. `412` when unconfigured.               |
| `GET /documents/:id/thumbnail` | Raw byte proxy for a document's thumbnail image.                                       |
| `GET /health`                  | Liveness shape. No DB round-trip — there is no DB.                                     |
| `GET /pillars`                 | Registry-first view of the fleet, prepended with the synthetic `documents` self-entry. |

Like every pillar, it self-registers with the `registry` pillar on boot
(opt-in via `POPS_REGISTRY_ENABLED`, using `bootstrapPillar` from
`@pops/pillar-sdk`). Its manifest declares empty `search`/`ai`/`uri`
dimensions in this scaffold increment — a future increment can populate
`search.adapters` once the pillar mirrors document metadata locally instead
of proxying live.

`inventory` used to embed a `PaperlessClient` directly; it now calls
`pillar('documents')` over the pillar SDK with graceful degrade (see
`pillars/inventory/src/api/documents/client.ts`), keeping its own
identically-shaped `paperless.*` contract for its frontend.

## Layout

```
pillars/documents/
├── package.json                @pops/documents
├── Dockerfile
├── mise.toml                    per-pillar tasks
├── scripts/generate-openapi.ts  ts-rest contract → openapi/documents.openapi.json
├── openapi/documents.openapi.json
└── src/
    ├── contract/                 rest.ts (ts-rest, zod) — the wire contract
    │   ├── rest.ts
    │   ├── rest-paperless.ts
    │   └── rest-schemas.ts
    └── api/
        ├── server.ts              HTTP entrypoint (port 3012)
        ├── app.ts                 Express app factory + route wiring
        ├── handlers.ts            /health + /pillars handlers
        ├── manifest.ts            the boot-time ManifestPayload
        ├── modules/paperless/     PaperlessClient + factory + types
        ├── rest/                  ts-rest handler composer + paperless handlers
        ├── files/                 raw thumbnail byte-proxy route
        └── pillars/               GET /pillars — registry-first fleet view
```

## Commands

```bash
pnpm --filter @pops/documents dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/documents typecheck    # tsc --noEmit
pnpm --filter @pops/documents test         # vitest run
pnpm --filter @pops/documents build        # tsc → dist/ + openapi snapshot
pnpm --filter @pops/documents start        # node dist/api/server.js
```

## Environment

| Var                       | Default                    | Notes                                                         |
| ------------------------- | -------------------------- | ------------------------------------------------------------- |
| `PORT`                    | `3012`                     | HTTP listen port.                                             |
| `DOCUMENTS_SELF_BASE_URL` | `http://localhost:${PORT}` | Advertised to the registry as this pillar's `baseUrl`.        |
| `PAPERLESS_BASE_URL`      | —                          | paperless-ngx base URL. Absent → integration is unconfigured. |
| `PAPERLESS_API_TOKEN`     | —                          | paperless-ngx API token.                                      |
| `POPS_REGISTRY_ENABLED`   | `false`                    | Opt-in self-registration with the `registry` pillar.          |
| `POPS_REGISTRY_URL`       | `http://registry-api:3001` | Registry base URL.                                            |

This scaffold does not wire `PAPERLESS_BASE_URL` / `PAPERLESS_API_TOKEN` /
networks / volumes / secrets in `infra/docker-compose.yml` — that is the
prod cutover tracked separately (ADR-039 workstream 22).

## Domain docs

See [docs/README.md](docs/README.md) for the full domain summary.
