# @pops/inventory

The **inventory** pillar — items, locations, warranties, and insurance. A
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
    └── db/         PRIVATE: drizzle schema, migrations, services, the SQLite opener
```

Everything inside the pillar imports across subdirs using **relative paths**
(a relative specifier such as ../db/index.js from within src/api/), never via the package name.

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server calls `bootstrapPillar`
from `@pops/pillar-sdk`, which POSTs the manifest to the `registry` pillar
(`/registry/register`) and tears the entry down on `SIGTERM`. There is no
per-request auth: the pillar trusts the docker network and the gateway in front
authenticates.

## Cross-pillar reconciliation

`home_inventory.purchase_transaction_uri` is a soft reference to a row the
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

## Domain docs

Feature-level documentation is colocated with the code it describes. The ones
that exist:

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
