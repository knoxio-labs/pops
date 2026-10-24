# contacts

The **contacts** pillar — the authoritative entities store (CRM-lite): the
people/companies/places (merchants, payees, banks, brands, …) that every other
pillar references by id or name. It is the only **Rust** pillar in the fleet — a
standalone [axum](https://github.com/tokio-rs/axum) HTTP service that owns its
own SQLite DB (`contacts.db`), serves an OpenAPI 3.0.3 contract, and
self-registers with the `registry` pillar on boot. Default port **3010** (the
slot after `ai` 3008 and `orchestrator` 3009; override with `CONTACTS_PORT` /
`PORT`).

## Contacts app

The shell loads the contacts import-review bundle from `/contacts-api/ui/contacts.js`
and its stylesheet from `/contacts-api/ui/contacts.css`. The Rust manifest owns the
navigation and page slots. The same contacts image builds and serves the app;
`CONTACTS_UI_PATH` defaults to `app/dist/remote` beneath the crate and points at
`/app/ui` in the image. Static serving accepts only contained JS/CSS files, with
no SPA fallback over API routes.

The app uses its own generated client against this pillar's canonical OpenAPI
snapshot. Open Contacts to stage a vCard or Google CSV export, then review its
parsed records before saving any directory changes. Reuse the source name and
address-book namespace for subsequent exports. Select a phone country explicitly
when national numbers should be normalized; leaving it blank retains the original
number without inferring a country.

The global “Import resolved contacts” action applies the server’s complete-batch
plan in one atomic request. Eligibility counts and its dedicated proof come from
the server; the browser never derives safe merges from visible rows or candidate
labels. Ambiguous rows and saved Later decisions remain pending. Unsaved manual
choices disable the global action until saved or evidence is explicitly reloaded.

The focused review combines the incoming person with only the existing candidates
selected for that decision. Existing preferred names, profiles and points remain
the default; using an incoming name or profile requires an explicit field choice.
Different-person choices persist independently, and
candidates left for later remain reviewable. Row and candidate pages share the
server's complete-snapshot proof; pagination never reclassifies a subset in the
browser. A conflict requires reloading evidence and choosing again. A network
failure keeps the exact decision and idempotency key available for retry.

Connections at `/contacts/connections` use the human-authorized provider routes.
Google consent opens only after an explicit action; Other contacts requires a
separate opt-in. iCloud app passwords are submitted only by the setup form and
are never stored in browser query caches. The most recent scan and last completed
preview remain separate, so a failed preparation does not hide a usable preview.

## Contract surface

contacts has no ts-rest/zod contract because it is not TypeScript. Its wire
contract is an OpenAPI 3.0.3 document built from `utoipa` annotations on the
route handlers (`src/openapi.rs`) and committed at
[`openapi/contacts.openapi.json`](openapi/contacts.openapi.json). The same
document is served live at `GET /openapi`, generated from the one source the
server and the `emit-openapi` bin share.

The HTTP surface:

| Path                                                 | What it serves                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/`                                                  | Stub root — a plain-text identity banner so `GET /` is not a 404.                                     |
| `/entities`                                          | Contact CRUD + paginated/filtered list (`GET`/`POST`).                                                |
| `/entities/{id}`                                     | Single-entity read/update/delete (`GET`/`PATCH`/`DELETE`).                                            |
| `/entities/lookup`                                   | Bulk match-column lookup (`POST`) — resolve many names/ids in one call.                               |
| `/entities/resolve`                                  | Canonical-ID mapping with a snapshot revision (`POST`); preserves missing and repeated requested IDs. |
| `/merges/groups/{id}`                                | Canonical root, retained members and optimistic directory revision (`GET`).                           |
| `/merges`                                            | Explicit subset merge with validated field/point selections (`POST`).                                 |
| `/merges/{id}/undo`                                  | Undo only an untouched merge (`POST`).                                                                |
| `/merges/keep-separate`                              | Stable member-pair decisions (`GET`); explicitly set or revoke a decision (`POST`).                   |
| `/entities/{id}/addresses`                           | An entity's addresses (`GET`/`POST`) — one row per branch (ADR-053).                                  |
| `/entities/{id}/avatar`                              | Avatar image upload (`PUT`, raw bytes + `Content-Type`) / serve (`GET`).                              |
| `/entities/{id}/poster`                              | Poster image upload (`PUT`, raw bytes + `Content-Type`) / serve (`GET`).                              |
| `/entities/{id}/person`                              | Local structured-name override (`GET`/`PUT`), independent of imported names.                          |
| `/entities/{id}/contact-points`                      | Labeled local and source email/phone/social/URL observations (`GET`/`POST`).                          |
| `/entities/{id}/contact-points/{point_id}/preferred` | Choose a preferred observation (`PUT`), scoped to its person and kind.                                |
| `/entities/{id}/sources`                             | Active and inactive namespaced source links (`GET`).                                                  |
| `/sources/accounts`                                  | Stable provider account metadata (`GET`/`POST`); credentials are never accepted here.                 |
| `/search`                                            | The contacts slice of unified search (`POST`) — ranked name hits.                                     |
| `/health`                                            | Fleet-standard liveness envelope.                                                                     |
| `/openapi`                                           | The OpenAPI document, regenerated live from the same `src/openapi.rs` source as the committed copy.   |

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
marker. File and provider adapters qualify names as complete only with explicit
nonblank given and family parts; additional names, prefixes and suffixes are
retained. CSV `Name`, vCard `FN` and Google display text never supply structured
parts; display-only and first-name-only observations remain unknown. Contact
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

`GET /imports/{id}/review-proposals` classifies the complete batch against every
eligible canonical person before returning bounded evidence. Incoming rows use
`offset`/`limit` (default 50, maximum 50); candidates use `candidateOffset` and
`candidateLimit` (default 50, maximum 200). `candidateRowId` requests one row's
candidate page. Subsequent pages carry the top-level `proposalRevision`; changed
directory, source or row-decision state returns `409`. Each row has its own
proposal proof for an atomic review decision. Counts cover the full batch and
candidate totals include omitted pages. Mutation authorization uses the complete
candidate set, including candidates selected on earlier pages.

Candidate IDs are current canonical people or persisted import row IDs. A
collision between two new rows requires importing one row first, then refreshing
to review the resulting person; an import row ID never pretends to be a person.
Matching uses validated exact email/phone keys or proven complete structured
names. File and provider adapters qualify explicit nonblank given and family
fields as complete, retaining additional names, prefixes and suffixes. CSV `Name`
and vCard `FN` display text are never split into parts, and first-name-only or
legacy display-only people still require manual name review. Declared incomplete
metadata remains incomplete. Shared identifiers, conflicting signals, homonyms, incomplete names and
stored keep-separate decisions require review. Original member/source ownership
and explicit preferred values remain visible after canonical grouping.

`POST /imports/{id}/review-decisions` applies one reviewed row with its exact
`batchRevision`, `directoryRevision`, opaque `proposalRevision` and retry key.
Explicit `mergeEntityIds` are the only identities combined with the incoming
person; `differentEntityIds` persist pair decisions independently, and omitted or
`laterEntityIds` stay pending. Existing canonical preferred values are the default:
a first incoming merge retains the selected existing root (the smallest authorized
ID when several are selected), while later decisions keep the row's current
canonical group. Empty selectors preserve its scalar fields, structured profile
and contact-point preferences; explicit validated field/point references replace
them. Optional `incomingFields: ["name", "personProfile"]` explicitly replaces
only those fields from this row's validated immutable source observation, including
before its entity/source IDs exist. Missing evidence, duplicate/conflicting field
selectors and field intent on a pure Later decision reject the complete action.
The incoming source keeps its original retained owner independently of the
canonical result. All ingestion, negative pairs, preferred-value
selections, subset merge and retry receipt share one SQLite transaction. A failed
selection rolls everything back. Empty candidate lists explicitly ingest an
incoming row so other staged rows can be reviewed against a real person. A pure
later decision saves the pending choices without creating a person. Selections
and point preferences use the same provenance contracts as identity merges.
Each request permits at most 499 merged or different identities, 10,000 deferred
identities, nine field selections, four point preferences and 1,000 expanded
negative-group operations or 10,000 stable member pairs; bodies are bounded to
128 KiB.

Batch revision, source-record revision and provider-account epoch protect stale
previews with `409`. Identical key/body retries return their persisted receipt
before checking revision; reusing a key with different decisions returns `409`.
File UIDs identify records within the selected account/collection. Without a UID,
the key includes SHA-256 of the exact file bytes and the record ordinal, so replay
identity is guaranteed only for the same file. Reordered or changed exports make
new proposals. Providers use the same staging transaction after gathering a full
scan, and explicit removals deactivate only the source's contributions.

Provider scans stage pages under one durable account run. A partial or failed
scan changes no cached observations, checkpoint, or directory data. Only complete
collection discovery and complete pages for every collection can atomically
reconcile the cache and produce shared import previews. Full enumeration proves
absence before proposing removals; incremental tombstones affect only their
source keys. Cached active ETags avoid redundant CardDAV downloads. Every preview
contains the complete current cached collection, including unchanged contacts
that still need a person decision. A later successful scan invalidates earlier
provider previews, including proposals without a linked person.

Provider management verifies an explicit human Cloudflare Access operator session;
LAN requests, absent API keys and service tokens do not authorize credential
administration. `GET /providers/accounts` returns connection state,
`POST /providers/google/authorize` creates a one-use read-only Google consent
attempt and returns its browser URL in the `201` response `Location` header; the
caller opens that URL after the request completes. A fetch never follows an
authorization redirect across origins.
`GET /providers/google/callback` consumes one-use operator-bound state before code
exchange. Successful callbacks return `303` to the fixed shell route
`/contacts/connections`. Browser callbacks accepting `text/html` return cancelled
consent to `?connectionError=cancelled` and other failures to
`?connectionError=failed` on that same fixed route. JSON clients retain structured
errors. Denial consumes valid one-use state without installing credentials;
expired, replayed or mismatched state remains a failure. No callback redirect
includes authorization details or provider error text. Ordinary consent
requests only `contacts.readonly`. Setting
`includeOtherContacts: true` on the authorization request explicitly adds
`contacts.other.readonly`; the choice is saved in the one-use authorization state
and installed account policy. A callback cannot broaden it. Other contacts use a
separate `other_contacts` collection, checkpoint and source namespace, even where
Google returns the same resource name in both streams. Both streams paginate and
reset expired seven-day sync tokens through the same atomic account coordinator.
Changing that policy requires a fresh human authorization and fences old jobs and
previews. `POST /providers/icloud/accounts` validates an app password against the
actual CardDAV principal. Existing account IDs reconnect only the same provider
subject; a mismatch changes neither the credential nor the account checkpoint.
`DELETE /providers/accounts/{id}` erases credentials and fences older work while
preserving canonical people, local observations and other account contributions.

`POST /providers/accounts/{id}/sync` starts a durable scan, and
`GET /providers/sync/{id}` exposes safe progress and import preview IDs. Account
status includes `latestRunId` and `previewRunId`, so hourly worker scans can be
discovered after reload; the last successful previews remain visible while a
later attempt runs or fails. These two
operations admit a verified operator or a registry-verified service account with
`contacts.providers.sync` scope. The process resumes saved scans after restart and
schedules connected accounts hourly. Expiring database leases reject old workers;
refresh requests are serialized separately before token rotation, with both
credential comparison and account-epoch checks before persistence. Transient
requests have three attempts with bounded backoff; durable job retries stop after
five operation failures. Revoked grants pause scheduling until reconnection.

Connections are optional. Without a valid root-key secret and Access configuration,
provider routes fail closed while ordinary contacts APIs continue. Production uses
`infra/docker-compose.contacts-providers.yml` as an opt-in overlay on the base
compose file. Provision `secrets/contacts_provider_root_key` with a random 32-byte
key encoded as 64 hexadecimal characters. Back up that key separately from SQLite;
losing it requires reconnecting accounts. Set `CLOUDFLARE_ACCESS_TEAM_NAME`,
`CLOUDFLARE_ACCESS_AUD` and `POPS_OPERATOR_EMAILS` as non-secret configuration.

Google additionally uses `infra/docker-compose.contacts-google.yml`,
`secrets/contacts_google_client_secret`, `CONTACTS_GOOGLE_CLIENT_ID`, and an exact
HTTPS `CONTACTS_GOOGLE_CALLBACK_URL` registered with Google. Browser connections
use the public shell origin and `/contacts-api/providers/google/callback` so the
fixed success redirect returns to the connections screen. The shell access log
removes callback query arguments; responses set `no-store` and `no-referrer`.
The root key and OAuth client secret enter the container only as Docker secrets;
provider passwords and refresh tokens are encrypted in the contacts database.

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

`POST /imports/{id}/apply-ready` accepts the review response's `batchRevision` and
`directoryRevision`, its `ready.proposalRevision`, and an `idempotencyKey`.
The server recomputes the entire batch against the directory and pending rows in
other batches before writing. Only unambiguous exact email, valid phone or complete
name matches, true new people and fresh recognized-source updates/removals apply.
First-name-only evidence never links people; a genuinely new first-name-only person
can still be created. Existing canonical preferred values remain the default.

The global action leaves ambiguous, invalid, stale, explicit Later and previously
ingested-but-unresolved rows untouched. Its ready proof also fences staging and
decision changes in other batches. An identical retry returns its immutable batch
receipt before any freshness checks; a changed body with the same key conflicts.
All selected rows and receipts share one reserved write transaction, with a bounded
expanded-write budget. Cross-batch classification stops automatic readiness when
more than 10,000 external pending rows or 100 external batches would be needed;
manual review remains available. Any late failure rolls the whole action back.

## Canonical person identity and guarded undo

A merge changes canonical membership, preserving every original entity, source,
address and blob. The request names only the roots to merge; another plausible
candidate is never included implicitly. The selected canonical root supplies
scalar defaults. Explicit field references select a retained member's original
value, and preferred point references select one group observation per kind.
Selectors are tagged: `{kind: "entity", field: "name", entityId}` selects a
retained entity; `{kind: "sourceRecord", field: "personProfile", sourceRecordId}`
selects imported name evidence. Source selectors support only `name` and
`personProfile` and pin the latest immutable observation when accepted. Later
provider refreshes do not replace that choice. Group reads expose original member
rows and applied references, including the pinned source observation ID.
References outside the selected groups, missing points/profiles and repeated
field selections reject the complete operation before it changes membership.

Historical IDs resolve to the current canonical entity on reads. Lists, lookup
and search expose canonical identities once; addresses, source records and
contact points project the whole group while retaining their original owner IDs.
Removed upstream points disappear from the current projection unless explicitly
preferred; chosen values remain visible with `active: false` and `preferred: true`.
All original point rows remain stored for provenance and undo.
Ordinary writes through retired IDs and deletion of active merged members return 409. Recognized source refreshes retain their original member ownership and
remain permitted. A new local edit or source link must target the canonical ID.

`POST /entities/resolve` accepts at most 500 IDs and returns
`{ data: [{ id, canonicalId }], revision }` in request order. Null means missing;
a request failure means resolution is unavailable. Consumers resolve historical
IDs before equality comparisons or aggregation. Multiple batches may be combined
only when their revisions agree; on a change, discard the sweep and retry it.
Legacy lookup returns one row per resolved canonical identity and is not a
replacement for this mapping.

Merge, undo and separation mutations carry an expected revision and idempotency
key. Repeating a successful request returns its original receipt, including after
later edits; reusing a key with another request conflicts. Audit records cannot be
updated or deleted. A keep-separate decision expands both current groups into
stable member pairs, so rejecting candidate C after merging A+B preserves both
A-C and B-C. Other candidates remain unchanged. Revocation is an explicit new
decision; source replay cannot clear a rejection.

Undo is deliberately conservative: **any subsequent directory mutation**, even
outside the group, blocks it. SQLite triggers fence entity, profile, point,
source/history, address, asset, selection and separation changes. Identical source
replay does not write or advance that revision. Undo restores previous membership
and selections only at the exact untouched post-merge revision. References written
in another pillar after a merge still name the chosen canonical UUID after undo;
contacts cannot reconstruct an external writer's intended former member.

The import reviewed-action service can compose `merge_in_transaction`,
`decide_in_transaction`, and `select_in_transaction` inside one caller-owned
`BEGIN IMMEDIATE` transaction. Any failure requires rolling back the complete
action. Create the incoming person and source, record candidate-specific negative
pairs, and merge last so its undo revision covers the entire directory change.
Selecting an incoming imported structured profile requires no local profile copy
and works without merging any existing candidate. Review projections can reuse
`group_in_transaction`, `projection::entity`, `persons::repo::get_profile_in_transaction`, and
`projection::points_in_transaction` in one consistent read snapshot.

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
