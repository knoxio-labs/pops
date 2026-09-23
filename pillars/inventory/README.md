# @pops/inventory

The **inventory** pillar — items (a container is an item), locations,
warranties, and insurance. A
standalone REST service that owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports a `./manifest`,
and self-registers with the `registry` pillar on boot. Port **3002**.

A pillar is a **black box with a published wire contract**. Everything else is
private, enforced by Node's `exports` map.

## Public surface

The `exports` map ships compiled `dist/contract/**`; the source it is built from
lives in `src/contract/`:

```jsonc
package.json
  "exports": {
    ".":           dist/contract/index.js            // FE-safe types + zod schemas
    "./manifest":  dist/contract/manifest.js         // pillar manifest
    "./api-types": dist/contract/api-types.generated.js
    "./openapi":   openapi/inventory.openapi.json     // canonical wire contract
  }
```

Only these resolve. `import '@pops/inventory/db'` or `import '@pops/inventory/api'`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at the resolver — the boundary is enforced
by Node itself, no reviewer needed.

- **Types + zod schemas** for every entity that crosses the wire (`Item`,
  `Location`, `Warranty`, …) — `import { Item, ItemSchema } from '@pops/inventory'`.
- **The manifest** — `id`, `name`, `version`, `surfaces: ['app']`, `description`,
  and the pillar's `settings` dimensions, consumed by the `registry` on
  self-registration — `import { inventoryManifest } from '@pops/inventory/manifest'`.
- **The OpenAPI 3 spec** at `openapi/inventory.openapi.json` — language-agnostic;
  non-TS consumers (Rust, Swift, Go) consume it directly.

## How consumers talk to inventory

Two supported call paths:

1. **TS consumers — the SDK proxy.** `pillar('inventory').items.list({ … })`
   via `@pops/pillar-sdk`. Types come from the contract's zod schemas, not from
   any server internals, so refactoring the server never breaks a consumer.
2. **Anyone else (Rust, Swift, plain fetch).** Consume
   `openapi/inventory.openapi.json` and call HTTP directly.

OpenAPI is the canonical wire contract; the TS types are a downstream view for
ergonomics.

## Layout

```
pillars/inventory/
├── package.json            @pops/inventory
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile              CMD node dist/api/server.js
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-inventory — FE feature module
├── openapi/
│   └── inventory.openapi.json   canonical wire contract (committed)
├── migrations/             drizzle journal
├── scripts/                codegen — openapi + api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest, errors, settings
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    ├── domain/     PRIVATE: the command layer (revisioned, event-logged writes)
    └── db/         PRIVATE: drizzle schema, migrations, services, the SQLite opener
```

Everything inside the pillar imports across subdirs using **relative paths**
(a relative specifier such as ../db/index.js from within src/api/), never via the package name.

## Data model

One identity per physical thing (Inventory ADR-002). `items` holds every item,
containers included: a container is a row with `is_container = 1` and an
`open`/`closed` `access`. Where an item is lives in `placement_kind` (a
location, a containing item, or in hand) with its matching reference, and CHECK
constraints refuse any other combination. `events` is the append-only history
and sync change sequence; triggers refuse updates and deletes. `mutations`,
`media` and `sync_meta` back the sync protocol.

Inventory ADR-002's accepted catalogue model replaces application-code types
with persisted owner-authored data. A published catalogue revision is an
immutable complete snapshot of types, fields and enum options; edits happen in
one draft and publication atomically validates and promotes it. IDs and keys are
permanent, while labels and ordering can change. `items.type_id` and
`item_field_values.field_id` use those stable IDs, and every item value records
the catalogue revision that validated it. Published snapshots and catalogue
audit events are append-only. Migration `0017_persisted_item_types` imported the
seven built-ins as revision 1; the persisted catalogue is now the only runtime
authority.

The primitive vocabulary is closed: short and long text, integer, exact decimal,
boolean, enum, fixed-unit measurement, date, date-time, HTTPS URL and item or
location reference. Cardinality is `one` or `many` rather than an array kind.
Decimals are strings, references retain a stable target ID even when the target
is missing, and measurements retain the field's fixed unit. The precise wire,
SQLite, compatibility and migration rules are Inventory ADR-002 D5.

Generic field writes validate the complete stable-ID field set against its
exact catalogue revision: kind, cardinality, required fields, storage authority,
archived selections and live reference constraints are one atomic check.
Generic item mutations carry the active `catalogueRevision`, address types and
fields by stable ID, and persist through the same validated replacement path as
the catalogue value API. A stale revision is rejected as `catalogue_changed`;
it never falls back to the revision-1 projection. Mutations that omit
`catalogueRevision` retain the named `typeKey`/`fields` protocol-1 contract for
the built-in types during rollout.
Archived enum selections and stale references remain readable when unchanged;
reference reads add `resolved`, `deleted` or `missing` without discarding the
target ID. Publication compatibility distinguishes additive, protocol-gated,
migration-required and forbidden changes. Required rewrites use only the named
`copy`, `set_default`, `map_enum`, `convert_decimal`, `replace_reference` and
`drop_value` operations. The server derives the exact affected type and field
sets from the base-to-draft compatibility diff; a submitted migration cannot
narrow or widen that set, and every changed field on a live affected type needs
a migration step. Publication dry-runs every derived affected row and appends a
`migrated` item event only after the complete candidate validates. Search
rebuilds use the candidate catalogue during that same transition.

`POST /type-catalogue/drafts/:revision/preview` applies the proposed operation
batch inside a rolled-back transaction. It returns fresh compatibility and
affected-item diagnostics bound to the exact base and draft revisions without
changing the persisted draft. Blocked validation responses retain every
definition-level issue and the same revision-bound compatibility and affected
item evidence in the standard error envelope.

`POST /type-catalogue/drafts/:revision/preview` applies the proposed operation
batch inside a rolled-back transaction. It returns fresh compatibility and
affected-item diagnostics bound to the exact base and draft revisions without
changing the persisted draft. Blocked validation responses retain every
definition-level issue and the same revision-bound compatibility and affected
item evidence in the standard error envelope.

Computed fields use the bounded, versioned expression AST from D5: no SQL,
JavaScript, clocks or network access; at most two reference hops; publication
rejects dependency cycles. A permitted explicit override wins without evaluating
dependencies, clearing it resumes evaluation, and every effective value tells a
client whether it is stored, computed, overridden or unavailable.

Migration `0012_items_single_identity` built this from `home_inventory` and
`containers` and dropped both. It aborts, writing nothing, when an id or a
case-insensitive code is held twice across the two old tables; the operator
resolves the clash by hand and restarts. A row pointing at a record that does
not exist never aborts it: the row is kept whole, as JSON, in
`migration_0012_orphans` with the reference it lacks and is not copied; an
item or box whose location is gone is migrated in hand, and an item whose box
is gone keeps its own location if that exists. After boot, legacy photos that only have
a `file_path` are hashed into `media` in the background.

The legacy `/items` and `/locations` routes keep their request and response
shapes over the new tables (`containerId` is `containing_item_id`, `assetId`
is `code`, `type` is `legacy_type`). The `/containers` routes are gone.

The served type catalogue includes a `book` type with page-count length,
genre, binding/format type, and ISBN fields. ISBN is type-specific metadata;
it does not reuse the legacy product-model column.

### Web catalogue editor

The shell mounts the owner editor at `/inventory/types`. It implements the
focused section layout decided in the design playground: a searchable type
list, type details, an ordered field outline, and one wide inspector for
stored, enum, reference, measurement, and computed definitions. The editor
creates the single draft on the first write, resumes it after reload through
`GET /type-catalogue/drafts/current`, and surfaces structured validation,
stale-base, compatibility, archive, abandonment, audit, and publication
states. Each successful draft patch includes the producer-counted live items
affected by its changed definitions, so the publication review does not
reimplement catalogue validation in the browser. Existing drafts also preview
pending form edits through the non-mutating preview endpoint after a short
debounce; sequenced responses prevent older diagnostics from replacing newer
ones, and the editor never patches a draft merely to preview it. A stale-draft reload clears
the rejected mutation, refetches both published and draft snapshots, and
rebuilds the open form from the persisted draft without replaying the rejected
operation. Published field identity and shape stay locked; incompatible
changes must be expressed as a replacement and an explicit named migration
rather than edited in place.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server calls `bootstrapPillar`
from `@pops/pillar-sdk`, which POSTs the manifest to the `registry` pillar
(`/registry/register`) and tears the entry down on `SIGTERM`.

## Who may call it

An inbound service-account gate covers the whole contract surface
([ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md)),
adopting the shape purchases already carries. It is derived from
`inventoryContract` rather than a hand-kept path list, so a new route —
including the sync surface `rest-sync.ts` adds — is gated the moment it
exists. `/health`, `/pillars` and `/openapi` are outside the contract and
stay ungated. The raw byte-serving routes in `files/router.ts` and
`media/router.ts` are not contract routes either, but they are declared to
the gate explicitly (`photos.file`, `documentFiles.file`,
`documents.thumbnail`, `inventory.media.upload`, `inventory.media.read`) and
held to the same scope semantics as the contract surface.

A caller presenting an `X-API-Key` is held to the service account behind it:
an unknown or revoked key is `401`, a live key whose grant misses the
operation is `403` logged with the account name and the exact missing scope,
and a registry that cannot be reached is `503` rather than admission. Scopes
are dotted and match by prefix, so `inventory.items` authorises
`inventory.items.list` and nothing under `inventory.locations`.

**A caller presenting no key is still admitted, and that is a decision, not
an omission.** `requireCredential` is `false`. Browser traffic through the
shell's nginx proxy presents none, and so does every other caller already
reaching this pillar over the docker network with no key; closing that path
is a fleet-wide decision about ADR-027's trust boundary, not this pillar's to
make alone.
`INVENTORY_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL`
(`resolveRequireCredential` in `src/api/middleware/service-account-scope.ts`)
flips that posture to mandatory for the duration of a run — for a live-seam
suite that needs to prove a presented key is actually checked rather than
merely admitted alongside everything else — and is gated on
`NODE_ENV !== 'production'` as well, so a stray value left set in a real
deployment can never reach it.

**This gate must not deploy before the registry grants below are in place.**
bfm's service account needs its grant widened to `inventory.sync`,
`inventory.types`, `inventory.codes` and `inventory.media`, and the MCP
service account's grant must include `inventory` (ADR-048's mobile
capabilities and the MCP tools both reach this pillar with a key). Until
those grants exist, every one of those callers starts answering `403` the
moment this ships — precisely what POPS-1878 did to purchases when its own
gate landed ahead of the MCP grant. Minting or widening a grant is a row in
the registry DB, an operator step rather than a repo change.

## Sync protocol

`src/contract/rest-sync.ts` is the protocol bfm relays to the phone under
`/mobile/inventory/*` (Inventory ADR-002, D9 and D10), in three sub-routers so
the gate above derives three grants: `inventory.sync` (`GET /sync/snapshot`,
`GET /sync/changes`, `GET /sync/items/:id/events`, `POST /sync/mutations`),
`inventory.types` (`GET /types`) and `inventory.codes`
(`POST /codes/suggest`).

- Every one of those routes needs `Pops-Inventory-Protocol: <n>`; missing or
  below `sync_meta.min_protocol` is `426 client_too_old`, checked by
  `src/api/sync/protocol.ts` ahead of the handlers.
- Protocol and catalogue revision are independent. Catalogue, snapshot, feed and
  mutation shapes carry `catalogueRevision`; a phone downloads an immutable
  revision before applying rows that name it, and an offline mutation pins the
  revision used to validate it. Generic stable-ID commands currently require
  that revision to be the active publication and reject stale input with
  `catalogue_changed`; compatibility proofs can widen that gate without ever
  silently reinterpreting a write against another snapshot.
- Protocol 2 item rows carry the persisted `typeId` and canonical
  stable-field-ID `fieldValues` (each with its source and catalogue revision).
  The existing `typeKey` and `fields` projection remains alongside them for
  protocol-1 readers during the transition.
- The snapshot serves live items and locations in pages whose opaque cursor
  pins the high-water `seq` of the first page; the change feed then serves
  every row (tombstones included) and every event after a `seq`. A cursor or
  feed position from another `sync_meta.epoch`, or a `since` above the latest
  `seq`, is `409 resync_required`; a cursor this server did not issue is
  `400 invalid_cursor`.
- `POST /sync/mutations` runs up to 50 mutations through the command layer
  in order, one transaction each, and answers one outcome per mutation.
  `Pops-Actor: device:<deviceId>;label=<percent-encoded label>` names the
  phone the change is recorded against, and is believed only from a caller
  whose account holds `inventory.sync`; no key records `web`, any other key
  `service:<account>`.
- Catalogue authoring does not pass through bfm. Inventory exposes a shared
  owner-only draft/publish surface for MCP and the web editor; bfm relays only
  immutable catalogue reads. `GET /type-catalogue/drafts/current` lets an
  owner resume the one in-progress draft after a reload or another authoring
  session; it returns `404 catalogue_draft_missing` when no draft exists.
- `GET /type-catalogue` and `GET /type-catalogue/audit` require a Cloudflare
  Access owner session or a service account granted `inventory.types.read`.
  Draft creation, patching, publication and abandonment require the owner
  session or `inventory.types.manage`. A catalogue revision is never mutable
  after publication; stale base revisions answer `409`.
- Events carry `before`/`after` keyed by wire field. A move records both
  `placement` and `previousPlacement`, each in the item row's placement
  shape (`{ kind: 'location', locationId }`, `{ kind: 'container', itemId }`,
  `{ kind: 'hand' }`, and `null` for no previous placement).
- Connections, fixtures and uploaded files are not on the snapshot or the
  feed: Inventory ADR-002 keeps them on their current tables and routes.
  Whether the phone needs connections at all is POPS-4110.

## Cross-pillar reconciliation

`items.purchase_transaction_uri` is a soft reference to a row the
finance pillar owns, alongside a nullable `purchase_transaction_stale_at`. It is
derived, never supplied: both item write paths compute it from the
`purchaseTransactionId` the item contract already carries, so the two cannot
disagree and no new wire field was needed. Changing the id repoints the URI and
clears the stale marker, because that marker was a verdict about the previous
target.

The server starts a worker on boot that walks the distinct URIs and asks finance
whether each still resolves: a 404 stamps `purchase_transaction_stale_at`, an
`ok` clears it, and anything else (unreachable pillar, malformed URI) leaves the
row untouched for the next tick. The row itself is never deleted — existence is
best-effort, staleness is a flag.

It ticks daily; `INVENTORY_RECONCILE_URI_INTERVAL_MS` overrides that for smoke
tests. A tick with no URIs returns silently without calling anyone, so the log
line only appears when there was work, and it carries the work-set size — an
aggregate of zero cannot otherwise be told apart from a leg that checked
nothing. Probes go out through the server SDK, which authenticates with the
`POPS_INTERNAL_API_KEY` service-account key; without one the probes fail to
authenticate and nothing is stamped.

Silence is not the same as health, so the tick also counts rows that name a
finance transaction and have no URI derived for it. That count can only be
non-zero if a writer stopped deriving or rows arrived by a path that bypasses
the item builders, and it is warned about whether or not the leg has other work.
It is the one signal that distinguishes "there was nothing to reconcile" from
"the thing that produces work has stopped".

### The dormant owner leg

`owner_uri` / `owner_stale_at` exist on the table and are reconciled by nothing.
No write path sets them and no contract field can name a user, so a leg over
them could only ever walk an empty list and report success — indistinguishable
from a healthy leg, and precisely the failure this worker exists to detect. The
columns stay in place for whenever an owner concept arrives; the cron gains a
leg at the same time as a writer, not before.

## Outbound service-account credential (POPS-4081)

Until POPS-4081, this pillar's only outbound leg (the reconciliation worker
above) rode on the server SDK's bare `POPS_INTERNAL_API_KEY` env fallback,
with no file-secret support of its own. `src/api/secret-source.ts` and
`src/api/pillars/{service-account,outbound,sdk-config}.ts` now give it the
same shape `finance` and `purchases` carry: `configureInventoryServerSdk()`
runs once at boot (`src/api/server.ts`), before anything resolves a
credential, and reads `POPS_INTERNAL_API_KEY_FILE` (a mounted Docker secret,
production) ahead of `POPS_INTERNAL_API_KEY` (inline, local dev). Absence is
a supported configuration, reported once at boot and never per request; a
configured-but-unreadable file is a boot-time refusal via
`assertSecretFilesReadable()`. This also means the reconciliation worker
above authenticates against a real file secret for the first time, not just
whatever happened to be in the process environment.

`src/api/ai/client.ts` is the one leg this account exists for today:
`POST /codes/suggest` (`src/api/rest/sync-handlers.ts`) ranks its
deterministic candidates through the `ai` pillar when a key is configured,
and always falls back to the deterministic order otherwise — no key, a
rejected credential, a timeout, a non-2xx response, or a response that is
not a same-set permutation of the candidates it was given (never a smaller,
larger, or substituted set, which could otherwise surface a held code). The
`ai` pillar does not publish the `codes.rank` route this client calls yet;
see `scripts/ci/check-cross-pillar-expectations.mjs`'s `KNOWN_BROKEN_OPERATIONS`
entry for `inventory -> ai (codes.rank)` and this slice's PR description for
what an operator needs to provision before that call can succeed.

`src/api/pillars/service-account.ts`'s `INVENTORY_SERVICE_ACCOUNT_SCOPES`
lists only `ai.codes.rank` — the reconciliation worker's `finance` call is
pre-existing, opaque (`callDynamic`, no operation to scope) and outside this
slice, so it is deliberately not added here.

## Commands

```bash
pnpm --filter @pops/inventory typecheck     # tsc --noEmit (src + scripts)
pnpm --filter @pops/inventory test          # vitest against a real temp SQLite DB
pnpm --filter @pops/inventory build         # verify manifest → tsc -b → openapi → api-types
pnpm --filter @pops/inventory dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/inventory start         # node dist/api/server.js
pnpm --filter @pops/inventory generate:openapi
pnpm --filter @pops/inventory generate:api-types
pnpm --filter @pops/inventory generate:manifest
docker build -f pillars/inventory/Dockerfile .
```

The same tasks are exposed through `mise.toml` (`mise run build`, `mise run test`,
`mise run lint`) for per-pillar federation.

## Codegen

- `generate:openapi` — regenerates `openapi/inventory.openapi.json` from the
  contract's zod schemas. CI gates on drift.
- `generate:api-types` — regenerates `src/contract/api-types.generated.ts` from
  the OpenAPI projection. CI gates on drift.
- `generate:manifest` — regenerates `src/contract/manifest.generated.ts`;
  `verify:manifest` (run first in `build`) fails the build on drift.

The contract (zod) is the single source of truth; OpenAPI, api-types, and the
generated manifest are downstream projections. No hand-authored OpenAPI, no
hand-authored paths.

## Decisions

- [ADR-001](docs/architecture/adr-001-domain-vocabulary.md) — one word per
  thing. The nouns every screen, contract and ticket uses, the two that were
  contested, and the five the design playground is still deciding by looking.
- [ADR-002](docs/architecture/adr-002-inventory-technical-design.md) — the
  technical design for the Inventory rebuild: one item identity for items and
  containers, the placement and lifecycle model, the append-only event log, the
  persisted owner-authored type catalogue, exact dynamic-value and computed-field
  semantics, the sync and conflict protocol with bfm and iOS, and the phased
  delivery. Builds on ADR-001 for every noun used here.

## Domain docs

Feature-level documentation is colocated with the code it describes. The ones
that exist:

- [`src/domain/commands/`](src/domain/commands/README.md) — the command
  layer: how one mutation is replayed, deferred, checked against its base
  revision, recorded and stored, and how an op is added.
- [`src/api/modules/fixtures/`](src/api/modules/fixtures/README.md) — what a
  fixture is, who calls it, and what it deliberately does not do.
- [`src/api/modules/reports/`](src/api/modules/reports/README.md) — the
  read-only report surface and the warranty window it does not own.
- [`app/src/pages/items-page/`](app/src/pages/items-page/README.md),
  [`item-detail-page/`](app/src/pages/item-detail-page/README.md),
  [`item-form-page/`](app/src/pages/item-form-page/README.md),
  [`location-tree-page/`](app/src/pages/location-tree-page/README.md).

Everything else is documented by the file header comments in the directory
itself.

## Bootstrap catalogue

POPS-4356 adds migration `0017_persisted_item_types`, which imports the current
`cable`, `charger`, `bulb`, `tape`, `storage_box`, `furniture` and `book`
definitions as catalogue revision 1 with deterministic IDs and unchanged type
keys. It rewrites
the existing fields blob into the value table only after descriptor parity and
every value validates; any unknown key or invalid value aborts the transaction.
There is no dual-write interval and no fallback to code definitions after
publication.

`storage_box` keeps capacity in litres, load limit in kilograms and outside
width, height and depth in centimetres as their fixed persisted units. Duty
rating remains a closed enum with stable option IDs for Light, Standard, Heavy
Duty and Extra Heavy Duty; stackability remains boolean. Migration
`0016_storage_box_dimensions` removed the former free-text Footprint before the
persisted catalogue import.
