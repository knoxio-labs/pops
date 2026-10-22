# @pops/documents

The **documents** pillar — a bridge pillar (ADR-035) that owns the
paperless-ngx integration. It has no domain database of its own; it proxies
live to a paperless-ngx instance and exposes a thin REST contract over it.
It listens on port **3012**.

| Surface                                 | What it does                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /paperless/status`                 | Whether paperless-ngx is configured and reachable, plus the upload limits (`maxUploadBytes`, `allowedMimeTypes`). |
| `GET /paperless/search`                 | Search paperless-ngx documents by query string.                                                                   |
| `GET /paperless/documents/:id`          | Resolve one document; 404 only when Paperless says it is gone.                                                    |
| `POST /paperless/documents`             | Raw upload: the body is the file, streamed to `post_document`. `202 { data: { taskId } }`.                        |
| `GET /paperless/tasks/:taskId`          | Where an upload stands: `pending`, `done`, `duplicate` or `failed`, with `documentId` and `reason`.               |
| `GET /paperless/documents/:id/download` | Raw byte stream of the file, the original unless `?original=false`. Honours a single `Range`.                     |
| `PATCH /paperless/documents/:id`        | `{ title? }`; only keys present are sent to Paperless.                                                            |
| `DELETE /paperless/documents/:id`       | Delete in Paperless (it moves to Paperless's trash). Knows nothing about links to the document.                   |
| `GET /documents/:id/thumbnail`          | Raw byte proxy for a document's thumbnail image.                                                                  |
| `GET /health`                           | Liveness shape. No DB round-trip — there is no DB.                                                                |
| `GET /pillars`                          | Fleet view parsed from the `POPS_PILLARS` env string, prepended with the synthetic `documents` self-entry.        |
| `GET /openapi`                          | The committed contract projection, served verbatim so peers can build a route map.                                |

Upload, task, download, update and delete answer 412 when Paperless is
unconfigured, 503 when it is unreachable and 502 when it answers with
anything unexpected; none of those is ever a 404. `search` and `get` answer
412 when unconfigured and 500 on any other Paperless failure.

When `POPS_REGISTRY_ENABLED=true` it self-registers with the `registry` pillar
on boot, using `bootstrapPillar` from `@pops/pillar-sdk/bootstrap`.

## Uploads

`POST /paperless/documents?fileName=<name>[&title=<title>]`, with the file's
MIME type as `Content-Type` and the bytes as the body. Paperless reads a
request body only up to its declared `Content-Length` (a chunked one arrives
empty), so every request to it carries an exact length. A body that declares
its length streams straight through; a chunked body is spooled to a temporary
file and sent once its size is known. A declared `Content-Length` over
`DOCUMENTS_MAX_UPLOAD_BYTES` is refused with 413 before any byte is read; a
chunked body is counted and refused with 413 the moment it passes the cap.
Only `application/pdf`, `image/*` and `text/*` are accepted (415 otherwise).
Paperless rejecting the file is 422.

Consumption is asynchronous. Poll `GET /paperless/tasks/:taskId` with the
returned id. Paperless 3.2.1 records a duplicate as a failed task carrying
`duplicate_of`; that becomes `duplicate` with the existing `documentId`. A
task a Paperless plugin stopped (barcode split, workflow deletion) finished
without a document of its own and is reported as `failed` with Paperless's
reason.

## Downloads and Range

Paperless 3.2.1 serves files through Django's `FileResponse`, which ignores
`Range`. When Paperless answers a ranged request with the whole file, this
pillar slices it and answers 206 (or 416 past the end). A 206 from Paperless
passes through unchanged. Several ranges, or a length Paperless did not
declare, fall back to the full 200.

## Authentication

Contract and raw byte routes validate a presented `X-API-Key` against the
registry and scopes projected from the documents contract and the raw routes
declared in `src/api/middleware/service-account-scope.ts`. Unknown or revoked
keys receive 401, insufficient grants receive 403, and an unreachable registry
receives 503. Requests without a key continue to
rely on the Docker network perimeter. `/health`, `/pillars`, and `/openapi`
stay outside the scope gate.

Reads sit under `documents.paperless` (`.status`, `.search`, `.get`, `.task`,
`.download`, `.thumbnail`); everything that changes Paperless sits under
`documents.write` (`.upload`, `.update`, `.delete`). A `documents.paperless`
grant therefore never reaches a write.

Inventory continues to call this bridge through the unauthenticated
`@pops/pillar-sdk/client` path, so those requests rely on the network perimeter
and do not use the scoped path. This preserves ADR-044's default: requests
without an API key pass, while callers that present one must hold the matching
documents scope.

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
    │   ├── rest-paperless.ts      paperless.* reads
    │   ├── rest-write.ts          write.* changes
    │   └── rest-schemas.ts
    └── api/
        ├── server.ts              HTTP entrypoint (port 3012)
        ├── app.ts                 Express app factory + route wiring
        ├── handlers.ts            /health + /pillars handlers
        ├── manifest.ts            the boot-time ManifestPayload
        ├── modules/paperless/     PaperlessClient + factory + types
        ├── rest/                  ts-rest handler composer + paperless handlers
        ├── files/                 raw byte routes: thumbnail, download (+ Range), upload
        └── pillars/               GET /pillars — `POPS_PILLARS` fleet view
```

## Error responses

REST failures use `{ code, message, requestId, retryable, details? }` with
registered `documents.*` codes. In particular,
`documents.paperless.not_configured` is a non-retryable configuration failure,
`documents.paperless.unavailable` (503) and `documents.paperless.upstream_failure`
(502) are retryable outages, and `documents.thumbnail.upstream_failure` is a
retryable 502; no response exposes Paperless diagnostics.

## Commands

```bash
pnpm --filter @pops/documents dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/documents typecheck    # tsc --noEmit
pnpm --filter @pops/documents test         # vitest run
pnpm --filter @pops/documents build        # tsc → dist/ + openapi snapshot
pnpm --filter @pops/documents start        # node dist/api/server.js
```

## Environment

| Var                          | Default                    | Notes                                                             |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `PORT`                       | `3012`                     | HTTP listen port.                                                 |
| `DOCUMENTS_SELF_BASE_URL`    | `http://localhost:${PORT}` | Advertised to the registry as this pillar's `baseUrl`.            |
| `PAPERLESS_BASE_URL`         | —                          | paperless-ngx base URL. Absent → integration is unconfigured.     |
| `PAPERLESS_API_TOKEN`        | —                          | paperless-ngx API token.                                          |
| `DOCUMENTS_MAX_UPLOAD_BYTES` | `104857600` (100 MB)       | Upload cap. Not a positive integer → the process refuses to boot. |
| `POPS_REGISTRY_ENABLED`      | `false`                    | Opt-in self-registration with the `registry` pillar.              |
| `POPS_REGISTRY_URL`          | `http://registry-api:3001` | Registry base URL.                                                |
| `POPS_PILLARS`               | — (empty registry)         | `id:baseUrl[,id:baseUrl,...]` string backing `GET /pillars`.      |

## Architecture

- [ADR-035](../../docs/architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — the bridge pillar kind this pillar is an instance of
- [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md) — the pillar-isolation program that pulled paperless-ngx out of `inventory`
