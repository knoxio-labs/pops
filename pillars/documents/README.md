# @pops/documents

The **documents** data pillar owns durable upload admission/receipts and a
private byte spool, alongside the Paperless integration. Paperless owns the
archive documents and consumption tasks; those records are not copied into
a second document catalogue.
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
| `GET /health`                           | Liveness plus a private upload-ledger query.                                                                      |
| `GET /pillars`                          | Fleet view parsed from the `POPS_PILLARS` env string, prepended with the synthetic `documents` self-entry.        |
| `GET /openapi`                          | The committed contract projection, served verbatim so peers can build a route map.                                |

Upload, task, download, update and delete answer 412 when Paperless is
unconfigured, 503 when it is unreachable and 502 when it answers with
anything unexpected; none of those is ever a 404. `search` and `get` answer
412 when unconfigured and 500 on any other Paperless failure.

When `POPS_REGISTRY_ENABLED=true` it self-registers with the `registry` pillar
on boot, using `bootstrapPillar` from `@pops/pillar-sdk/bootstrap`.

## Uploads

### Durable operations

`write.createUpload` (`POST /paperless/uploads`) accepts a strict JSON intent:
`{operationId, fileName, title?, mimeType, byteLength, sha256}`. The UUID is
caller-selected and must survive consumer restarts. MIME is its normalized
essence; SHA-256 is lowercase hexadecimal. The filename is metadata, never a
path. Replaying identical input returns the original operation; changing any
field under the UUID returns409. Existing proof remains readable when policy
or owner configuration changes.

`write.uploadContent` (`PUT /paperless/uploads/:operationId/content`) is a raw
byte route, explicitly included in the live raw-route scope/capability map.
It is deliberately outside the JSON OpenAPI projection, like the existing
raw upload/download routes. Send the intent's MIME as `Content-Type`. The
stream must match both exact length and digest. A private0600 temporary file
is fsynced, atomically linked under the validated operation UUID without
overwriting an existing file, and its directory fsynced before SQLite commits
`admitted`. Interrupted admission can be retried with the same input; neither
admission nor its retries send anything to Paperless.
Existing files are opened with `O_NOFOLLOW`, checked as regular files, and
hashed through their open handle. Dispatch streams the same held inode;
replacing its pathname after validation cannot substitute different bytes.

`write.dispatchUpload` (`POST /paperless/uploads/:operationId/dispatch`, no
body) first exclusively creates and fsyncs a tombstone in separate dispatch
history, fsyncs that directory, then commits the same claim UUID in SQLite
before one upstream POST. That
POST does not follow redirects. A valid Paperless task receipt is committed
before the response is sent. All subsequent dispatch requests return stored
proof and never issue another upstream POST. Network loss, malformed receipt,
redirects, or a process restart after the claim expose `outcome_unknown`;
even a crash before the socket send does not make a claimed operation safe
to send again. No filename search, custom-field setting or guessed task ID
is used to repair that irreducible upstream window.

The guard has a deployment UUID also bound in the ledger. Server startup
never initializes/replaces a missing guard. `upload:guard:init` requires
explicit `DOCUMENTS_UPLOAD_GUARD_DIR` and `DOCUMENTS_UPLOAD_GUARD_ID` and
provisions only a new empty directory. Tombstones never expire. An
unsent-looking restored row with a tombstone returns `outcome_unknown`,
`blockedBy:restored_history`, without a POST. Missing, corrupt or mismatched
history returns `blockedBy:guard_unavailable` and refuses dispatch while
retained proof stays readable. An ordinary unsent restart with intact guard
and no tombstone remains usable. Concurrent readers never rewrite an active
original claimant's pending transition.
Tombstones retain the original typed input privately alongside its digest.
If a restored DB predates the entire intent, lookup reconstructs only
`outcome_unknown` with that original input; changed UUID reuse is refused.
Task/document IDs are never reconstructed from a tombstone.

`paperless.upload` (`GET /paperless/uploads/:operationId`) recovers the durable
record. For a known accepted task it reads that exact task from the original
configured owner. Missing/unavailable tasks retain accepted proof. Done or
duplicate requires an actual positive original document ID, which is saved
before spool release. Later upstream task disappearance cannot erase that
receipt. Failed/unknown operations retain their bytes and proof without TTL
or automatic eviction. No upstream request is made when the configured
Paperless origin/base path differs; `ownerMatches:false` accompanies retained
proof. A late response may settle only its original dispatch claim.

Scopes are `documents.write.createUpload`, `.uploadContent`, `.dispatchUpload`
and `documents.paperless.upload`. A read grant does not grant admission or
dispatch. Existing service-account/network-perimeter rules are unchanged;
there is no new user/account identity policy. Legacy raw POST below is
preserved, but does not provide durable operation recovery.

### Legacy raw upload

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

| Var                          | Default                         | Notes                                                                           |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `PORT`                       | `3012`                          | HTTP listen port.                                                               |
| `DOCUMENTS_DATA_DIR`         | `./data/documents`              | Private ledger and spool root; container default `/data/documents`.             |
| `DOCUMENTS_UPLOAD_GUARD_DIR` | `./data/documents-upload-guard` | Separately retained history, physically outside the data directory.             |
| `DOCUMENTS_UPLOAD_GUARD_ID`  | —                               | Explicit deployment UUID matching its pre-provisioned guard and ledger binding. |
| `DOCUMENTS_SELF_BASE_URL`    | `http://localhost:${PORT}`      | Advertised to the registry as this pillar's `baseUrl`.                          |
| `PAPERLESS_BASE_URL`         | —                               | paperless-ngx base URL. Absent → integration is unconfigured.                   |
| `PAPERLESS_API_TOKEN`        | —                               | paperless-ngx API token.                                                        |
| `DOCUMENTS_MAX_UPLOAD_BYTES` | `104857600` (100 MB)            | Upload cap. Not a positive integer → the process refuses to boot.               |
| `POPS_REGISTRY_ENABLED`      | `false`                         | Opt-in self-registration with the `registry` pillar.                            |
| `POPS_REGISTRY_URL`          | `http://registry-api:3001`      | Registry base URL.                                                              |
| `POPS_PILLARS`               | — (empty registry)              | `id:baseUrl[,id:baseUrl,...]` string backing `GET /pillars`.                    |

## Architecture

The pillar opens its own `documents.db` with generated Drizzle migrations,
WAL and synchronous FULL commits. The server checks this handle and guard for health
and closes it on shutdown.

The runtime image creates empty DATA and guard directories with mode `0700`,
owned by its non-root runtime user. It never creates an authority marker or
chooses a deployment UUID. The builder includes the normal Python/make/C++
SQLite fallback toolchain; those packages are not copied into the runtime.

The image declares `smoke-fixture.json` through `pops.smoke.fixture`. The isolated
image smoke first requires HTTP 500 from fresh missing and mismatched synthetic
authority fixtures, then explicitly invokes the maintained provisioning CLI on
a separate fresh fixture and requires ordinary health 2xx plus writability of
both mounts. The harness owns all fixture volumes and UUIDs. This is test-only
provisioning, not production initialization or evidence of deployed storage.

The production volume `pops-documents-data` holds both the ledger and private spool; do not mount the spool as public content.
`pops-documents-upload-guard` is a separate persistent volume holding dispatch
history; never restore or expire it alongside older ledger/spool backups.
No token, request header or document bytes are stored in ledger JSON.

The opt-in Documents Litestream sidecar backs up SQLite receipts only. It
does **not** back up the spool or promise a synchronized cross-system restore.
For complete in-flight byte recovery, stop the Documents writer, back up the
entire private data volume consistently, then restart it. Restore that volume
as a unit while preserving the current **separate guard volume** and its
deployment identity. Tombstones then quarantine rolled-back unsent-looking
rows in the running producer. Missing/corrupt spool bytes fail validation
before dispatch; they are never replaced by guessed archive data.

Rollback of the entire authority, including guard and deployment config,
cannot be distinguished from a genuinely earlier state by this local design.
Full-host restore must start quarantined with a new externally provisioned
guard UUID; its mismatch with the restored DB binding blocks dispatch.
Never copy/reuse a restored guard/config as evidence of no prior send. Release
requires an actual deployer workflow enforcing this boundary, separate from
the reference application Compose file. There is no automatic rebind/unlock.

Paperless retains its separate archive backup. No live volume, replica URL,
credential or deployment setting is changed by the source declaration.

- [ADR-035](../../docs/architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — implicit pillar kinds; Documents now owns upload state as well as its external integration
- [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md) — the pillar-isolation program that pulled paperless-ngx out of `inventory`
