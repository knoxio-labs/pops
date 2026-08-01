# @pops/documents

The **documents** pillar — a bridge pillar (ADR-035) that owns the
paperless-ngx integration. It has no domain database of its own; it proxies
live to a paperless-ngx instance and exposes a thin REST contract over it.
It listens on port **3012**.

| Surface                        | What it does                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `GET /paperless/status`        | Whether paperless-ngx is configured (env present) and reachable.                                           |
| `GET /paperless/search`        | Search paperless-ngx documents by query string. `412` when unconfigured.                                   |
| `GET /documents/:id/thumbnail` | Raw byte proxy for a document's thumbnail image.                                                           |
| `GET /health`                  | Liveness shape. No DB round-trip — there is no DB.                                                         |
| `GET /pillars`                 | Fleet view parsed from the `POPS_PILLARS` env string, prepended with the synthetic `documents` self-entry. |
| `GET /openapi`                 | The committed contract projection, served verbatim so peers can build a route map.                         |

When `POPS_REGISTRY_ENABLED=true` it self-registers with the `registry` pillar
on boot, using `bootstrapPillar` from `@pops/pillar-sdk/bootstrap`.

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
        └── pillars/               GET /pillars — `POPS_PILLARS` fleet view
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
| `POPS_PILLARS`            | — (empty registry)         | `id:baseUrl[,id:baseUrl,...]` string backing `GET /pillars`.  |

## Architecture

- [ADR-035](../../docs/architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — the bridge pillar kind this pillar is an instance of
- [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md) — the pillar-isolation program that pulled paperless-ngx out of `inventory`
