# contacts

The **contacts** pillar — the authoritative entities store (CRM-lite): the
people/companies/places (merchants, payees, banks, brands, …) that every other
pillar references by id or name. It is the only **Rust** pillar in the fleet — a
standalone [axum](https://github.com/tokio-rs/axum) HTTP service that owns its
own SQLite DB (`contacts.db`), serves an OpenAPI 3.0.3 contract, and
self-registers with the `registry` pillar on boot. Default port **3010** (the
slot after `ai` 3008 and `orchestrator` 3009; override with `CONTACTS_PORT` /
`PORT`).

## Contract surface

contacts has no ts-rest/zod contract because it is not TypeScript. Its wire
contract is an OpenAPI 3.0.3 document built from `utoipa` annotations on the
route handlers (`src/openapi.rs`) and committed at
[`openapi/contacts.openapi.json`](openapi/contacts.openapi.json). The same
document is served live at `GET /openapi`, generated from the one source the
server and the `emit-openapi` bin share.

The HTTP surface:

| Path                                                 | What it serves                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/`                                                  | Stub root — a plain-text identity banner so `GET /` is not a 404.                                   |
| `/entities`                                          | Contact CRUD + paginated/filtered list (`GET`/`POST`).                                              |
| `/entities/{id}`                                     | Single-entity read/update/delete (`GET`/`PATCH`/`DELETE`).                                          |
| `/entities/lookup`                                   | Bulk match-column lookup (`POST`) — resolve many names/ids in one call.                             |
| `/entities/{id}/addresses`                           | An entity's addresses (`GET`/`POST`) — one row per branch (ADR-053).                                |
| `/entities/{id}/avatar`                              | Avatar image upload (`PUT`, raw bytes + `Content-Type`) / serve (`GET`).                            |
| `/entities/{id}/poster`                              | Poster image upload (`PUT`, raw bytes + `Content-Type`) / serve (`GET`).                            |
| `/entities/{id}/person`                              | Local structured-name override (`GET`/`PUT`), independent of imported names.                        |
| `/entities/{id}/contact-points`                      | Labeled local and source email/phone/social/URL observations (`GET`/`POST`).                        |
| `/entities/{id}/contact-points/{point_id}/preferred` | Choose a preferred observation (`PUT`), scoped to its person and kind.                              |
| `/entities/{id}/sources`                             | Active and inactive namespaced source links (`GET`).                                                |
| `/sources/accounts`                                  | Stable provider account metadata (`GET`/`POST`); credentials are never accepted here.               |
| `/search`                                            | The contacts slice of unified search (`POST`) — ranked name hits.                                   |
| `/health`                                            | Fleet-standard liveness envelope.                                                                   |
| `/openapi`                                           | The OpenAPI document, regenerated live from the same `src/openapi.rs` source as the committed copy. |

Person entities retain the same fleet UUID identity as other entities. Multiple
people may share a display name, including first-name-only records, and a person
may share a name with a merchant. The Unicode case/diacritic unique-name rule
continues to apply across all non-person entities. Creates, renames and type
changes use the effective resulting type. A person with profile, source or point
data cannot change to a non-person type.

`GET /entities` and `POST /entities/lookup` accept `excludePersons: true` for
merchant-specific calls; the default continues to include people as financial
counterparties. Lookup entries include `type`. A name or alias is no longer a
unique person identifier, so consumers must reject ambiguous matches.

Person profiles are explicit local structured-name overrides. Imported records
retain their own display and structured names with an explicit completeness
marker; display text alone does not establish complete-name evidence. Contact
points retain the original value and label. Conservative email and validated
international phone keys are derived separately for matching. National phone
values require an explicit known ISO `countryCode`; no country is inferred from
a machine locale or provider. The original value and country context are retained.
Unsupported values
and social/URL points remain raw observations without an eligible match key.

Sources use an opaque UUID account plus stable `provider`/`accountKey` identity,
then `collectionKey`/`recordKey` within that account. Account labels may change
without changing identity; registering without a label preserves an existing one.
Observation apply/deactivate functions accept the
caller's SQLite transaction and never commit it themselves. Refresh replaces only
that source record's active observations; an identical active observation performs
no writes. Surviving points retain their IDs and preferred status. Removed values
remain inactive for audit,
local values and local profiles survive, and preferred selections remain attached
even when their source disappears. Each source record carries a monotonic revision
for optimistic staging checks, with previous observation snapshots retained in
`source_record_history`. These DTOs contain no authentication material.

`POST /imports/files` accepts raw Google Contacts CSV or vCard 3.0/4.0 bytes,
with `accountId`, `collectionKey`, `format` (`google_csv` or `vcard`) and an
explicit `encoding` (`utf8`, `utf16_le`, `utf16_be`, `windows1252`; default
`utf8`). Optional `phoneCountryCode` supplies explicit ISO country context for
national phone values. Uploads and serialized previews are bounded to 5 MiB and
10,000 rows. Malformed records remain in a durable preview with safe issue codes;
staging never changes people or their observations.

`GET /imports/{id}` returns the saved preview. `POST /imports/{id}/commit` accepts
`revision`, `idempotencyKey`, and selected `decisions`, each shaped as
`{ rowId, decision: { action, entityId? } }`. Actions are `create_person`,
`link_person`, `update_source`, `deactivate_source` and `skip`. Every selected row
must be valid for its action; the whole selection either commits or rolls back.
Unselected rows remain pending for a later decision. Skipping processes an import
row; it does not declare two people different. A target link is always explicit:
similar display names, first names, email addresses or phone numbers do not choose
an owner. Recognized source updates are distinct from choosing a person to link.

Batch revision, source-record revision and provider-account epoch protect stale
previews with `409`. Identical key/body retries return their persisted receipt
before checking revision; reusing a key with different decisions returns `409`.
File UIDs identify records within the selected account/collection. Without a UID,
the key includes SHA-256 of the exact file bytes and the record ordinal, so replay
identity is guaranteed only for the same file. Reordered or changed exports make
new proposals. Providers use the same staging transaction after gathering a full
scan, and explicit removals deactivate only the source's contributions.

Registration is outbound: on boot (when opted in) contacts POSTs its manifest to
the registry, then heartbeats every 10s and deregisters on `SIGTERM`/`SIGINT`.

Every route error uses the ADR-054 envelope: `code`, `message`, `requestId`,
`retryable`, and optional `details`. Contacts codes are stable dotted values
under `contacts.*` and are enumerated in OpenAPI. The request-id layer echoes
an incoming `X-Request-Id` or mints one, then returns it in both the response
header and error body. Database diagnostics are logged with that id; clients
receive a stable error code and generic message, never SQLite or `sqlx` error
text. Import persistence logs contain only a safe classification and request id,
with `contacts.import.storage` returned to the caller.

## OpenAPI emit and cross-language consumption

The committed JSON is generated, never hand-authored. The `emit-openapi` binary
writes `openapi/contacts.openapi.json` from `src/openapi.rs`; CI runs it and
`git diff --exit-code`s the result, so the document can never drift from the
code — the Rust mirror of the TS pillars' `generate-openapi.ts` drift gate.

Because contacts is Rust and ships no npm package, consumers cannot depend on a
`@pops/*` contract package. Per
[ADR-033](../../docs/architecture/adr-033-cross-language-pillar-contracts.md) the
OpenAPI snapshot **is** the cross-language contract: a consumer vendors a copy of
`contacts.openapi.json` and generates a typed client against it. `app-finance`
does exactly this — its vendored copy lives at
`pillars/finance/app/contracts/contacts.openapi.json`, kept in lockstep with the
canonical file by a repo-level drift gate
(`scripts/ci/check-vendored-contracts.mjs`).

## Service-account scopes

Requests without an X-API-Key continue through to the existing perimeter.
Credentialled requests resolve that key through the registry's
GET /service-accounts/self endpoint. The scope map uses the operation IDs in
the contacts OpenAPI document with contacts as its root, so new contract
operations acquire a required scope when they are added.

Unknown or revoked keys receive 401, a live account without the required
dotted-prefix scope receives 403, and an unavailable registry receives 503.
The verifier caches successful lookups for 30 seconds and rejected keys for
5 seconds; registry failures are not cached. The Rust gate is a hand-maintained
mirror of the TypeScript rules in
[service-account-scope.ts](../../libs/sdk/src/server/service-account-scope.ts)
and [service-account-verifier.ts](../../libs/sdk/src/server/service-account-verifier.ts).

## Blob storage

`avatarAssetId` and `posterAssetId` on an entity point at rows in a `blobs`
table in the same `contacts.db` SQLite file — bytes are a `BLOB` column, not a
filesystem path. That is the same call finance's ADR-050 made for institution
logos, for the same reason: this pillar's litestream config already replicates
the whole `contacts.db` file, so a filesystem tree would need its own,
separate backup mechanism this repo has no generic answer for, and it needs no
extra fresh-volume provisioning (chown/mkdir) beyond what migrations already
give the SQLite file. Content type is capped to `image/png`, `image/jpeg` and
`image/webp` (SVG excluded — an SVG can carry a script payload that executes
in the viewer's origin) and 2 MiB, matching finance's institution-logo upload.
A replacement always inserts a new blob row, repoints the entity's asset id,
then deletes the old row — so a crash mid-operation never leaves the entity
referencing nothing.

## What proves cross-language wire conformance

There is no generic conformance harness in the repo — no `wire-conformance`
package, no black-box probe CLI a pillar author can point at a base URL. Four
things stand in for one, and they are what a change to the wire shape has to
survive.

**`tests/manifest_fixture.rs` pins the manifest against the real wire schema,
via a committed fixture.** Rust cannot import
`libs/sdk/src/manifest-schema/schema.ts`, so nothing here can call the
validator directly the way a TS pillar's own test does. Instead
`tests/manifest_fixture.rs` serialises `build_contacts_manifest`'s real output
and compares it to the committed
`tests/fixtures/manifest.json` (regenerate with `UPDATE_MANIFEST_FIXTURE=1
cargo test -p contacts --test manifest_fixture` when a deliberate change moves
it), and
`scripts/ci/__tests__/check-contacts-manifest-fixture.test.ts` parses that same
committed file with the real `ManifestPayloadSchema`. Together the two prove
`manifest.rs`'s actual output is schema-valid without either language reading
the other's code — closing the gap `scripts/ci/check-manifest-payload-coverage.mjs`
(POPS-2585) cannot: it reads `.ts`/`.tsx` only, so this pillar is invisible to
it (POPS-2592).

**The registry rejects a non-conforming manifest at register time.**
`pillars/registry/src/api/modules/external-registry/register.ts` runs the
posted `manifest` through `validateManifestPayload` from `@pops/pillar-sdk` —
the same validator TS pillars run locally inside `bootstrapPillar` — and
answers `400 { ok: false, issues }`, with a second `400` when
`manifest.pillar !== pillarId`. On the contacts side that 400 is terminal:
`RegistryError.retriable` is true only for a network failure or `status >= 500`
(`src/registry/transport.rs`), so `register_with_retry` logs and stops instead
of backing off (`src/registry/lifecycle.rs`). A non-conforming manifest means
contacts serves its HTTP surface but never appears in the registry — which is
why `is_manifest_semver` in `src/registry/mod.rs` is deliberately stricter than
semver.

**`tests/openapi_contract.rs` pins the emitted document.** Four guards: the
`openapi` version string starts with `3.0`; _every_ `operationId` is dotted and
lowercase, not merely the seven required ones
(`entities.{list,get,create,update,delete,lookup}`, `search.search`); the wire
`Entity` schema exposes `id`/`name`/`type`/`aliases`/`defaultTags`/
`lastEditedTime` and hides `notionId`/`ownerUri`/`ownerUriStaleAt`; and
`/search` is present.

**`tests/registry.rs` drives the real `reqwest` transport** against a throwaway
axum registry on an ephemeral port: register POSTs a schema-shaped manifest to
the canonical path, falls back to the legacy dotted path on a 404, and
heartbeat/deregister round-trip. `tests/entities.rs` and `tests/health.rs`
cover the REST envelopes by `oneshot`ing the assembled router over a migrated
in-memory SQLite DB.

## Layout

```
pillars/contacts/
├── Cargo.toml              crate `contacts` (lib + `contacts`/`emit-openapi` bins)
├── Dockerfile              builds and runs the `contacts` binary
├── mise.toml               per-pillar cargo tasks
├── migrations/             embedded SQLite migration journal (applied on boot)
├── openapi/                committed OpenAPI 3.0.3 contract
├── src/
│   ├── main.rs             server entry point (axum serve + graceful shutdown)
│   ├── bin/emit_openapi.rs the `emit-openapi` drift-gate generator
│   ├── config.rs           env-resolved Config (DEFAULT_PORT = 3010)
│   ├── app.rs              router assembly + AppState
│   ├── db.rs               pool connect + migrate
│   ├── openapi.rs          utoipa-built OpenAPI document (single source)
│   ├── manifest.rs         the pillar manifest registered with the registry
│   ├── registry/           register/heartbeat/deregister lifecycle + transport
│   ├── entities/           entities model, repo, and routes
│   ├── blobs/              blob storage backing the avatar/poster asset ids
│   ├── search/             contacts search slice
│   ├── health.rs           /health envelope
│   └── time.rs             timestamp helpers
└── tests/                  integration tests (entities, health, openapi, registry, manifest fixture)
    └── fixtures/manifest.json  committed manifest fixture (see "What proves cross-language wire conformance")
```

## Build, test, run

contacts uses `mise` for per-pillar tasks (defined in `mise.toml`), all of which
wrap `cargo` against the repo-root cargo workspace:

```sh
# From pillars/contacts/
mise run build       # cargo build --all-targets
mise run test        # cargo test  (unit + tests/)
mise run lint        # cargo clippy -D warnings && cargo fmt --check
mise run typecheck   # cargo check --all-targets
mise run dev         # cargo watch -x run

# Or call cargo directly:
cargo run                                  # boot the server on :3010
cargo test                                 # run all tests
cargo run --bin emit-openapi               # regenerate openapi/contacts.openapi.json
```

The binary boots with zero env in local/dev: the port defaults to `3010`, the
SQLite file to `contacts.db` (created on first boot via `?mode=rwc`), and the
schema is applied from the embedded migration journal. In-cluster overrides
(`CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db`, `BUILD_VERSION`, …) arrive via
the contacts service definition in `infra/docker-compose.yml`.

## Self-registration

Registry self-registration is **opt-in** via `POPS_REGISTRY_ENABLED=true` (off in
local/test so a run never reaches out to a registry). When enabled, the lifecycle
registers with backoff, heartbeats every 10s, and deregisters best-effort on
shutdown — the reference Rust implementation of the same handshake the TS pillars
run through `@pops/pillar-sdk`. The registry origin resolves
`POPS_REGISTRY_URL` → `CORE_URL` → `http://registry-api:3001`; the base URL the
registry records for contacts resolves `CONTACTS_SELF_BASE_URL` →
`http://localhost:<port>`. A missing or broken registry never blocks boot:
registration retries in the background while the server serves its surface.
