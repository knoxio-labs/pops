# @pops/cerebrum

The **cerebrum** pillar — the memory / retrieval / autonomous-agent surface
(engrams, retrieval, ingest/emit, plexus, reflex, glia, nudges, and the `ego`
conversational surface). A standalone REST service that owns its own SQLite DB,
serves a [ts-rest](https://ts-rest.com) contract built from zod, runs a worker,
exports a `./manifest`, and self-registers with the `registry` pillar on boot.
Port **3007**.

Architecture decisions (engram storage model, hierarchical scopes, Glia trust
graduation): [`docs/architecture/`](docs/architecture/). Feature-level docs are
colocated as `README.md` next to the code they describe — see
`src/api/modules/{glia,reflex,thalamus,workers}/`.

## Public surface

```jsonc
package.json
  "exports": {
    ".":          → src/contract/index.ts        // FE-safe wire types + zod schemas
    "./manifest": → src/contract/manifest.ts     // ModuleManifest values (cerebrum + ego)
    "./api-types":→ src/contract/api-types.generated.ts
    "./openapi":  → openapi/cerebrum.openapi.json // canonical wire contract
  }
```

The committed `openapi/cerebrum.openapi.json` is the wire-typed source for
polyglot + FE consumers. The contract (`src/contract/rest.ts`, zod) is the
single source of truth; OpenAPI and api-types are generated projections,
drift-checked in CI.

`ego` is co-located here (it has no contract of its own); its settings nest
under cerebrum, so the pillar exports both `cerebrumManifest` and `egoManifest`.

## Layout

```
pillars/cerebrum/
├── package.json            @pops/cerebrum
├── Dockerfile
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-cerebrum — FE feature module
├── docs/architecture/      ADRs
├── openapi/
│   └── cerebrum.openapi.json   generated projection of the contract
├── scripts/                verify-manifest, generate-openapi, generate-api-types
└── src/
    ├── contract/   PUBLIC: ts-rest contract (rest.ts), zod schemas/types, settings manifests, manifest
    ├── api/        PRIVATE: Express container — /health + /pillars probes + the ts-rest endpoints
    ├── db/         PRIVATE: SQLite schema + services + the sqlite-vec loader (openCerebrumDb)
    └── worker/     PRIVATE: background worker (needs Redis)
```

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. The heartbeat reports the live
`cerebrum.vectorSearch` capability (whether sqlite-vec loaded on this
connection) and advertises the pillar's federated `/settings/*` surface. There
is no per-request auth.

## Vector storage invariants

Embeddings occupy two tables in `cerebrum.db`, and only one of them is in the
migration journal:

| Table            | Created by                                                                                                                   | In `migrations/meta/_journal.json` |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `embeddings`     | `migrations/0054_embeddings_baseline.sql` (hand-written); drizzle mirror in `src/db/schema/core/embeddings.ts`               | yes, as `0054_embeddings_baseline` |
| `embeddings_vec` | `ensureEmbeddingsVecTable` in `src/db/vec-loader.ts` — `CREATE VIRTUAL TABLE IF NOT EXISTS … USING vec0(vector float[1536])` | no                                 |

The `0054` header comment records why: drizzle's schema builder cannot express
a virtual table, and keeping the `CREATE VIRTUAL TABLE` out of the journal lets
the metadata baseline apply on a build where `sqlite-vec` is unavailable.
`openCerebrumDb` runs the steps in that order — extension load, then
`migrate()`, then create-and-probe — so a failed extension load costs
`vecAvailable: false` and nothing else; the journal still applies in full.
`vecAvailable` is `true` only when the load, the create, **and** a
`SELECT 1 FROM embeddings_vec LIMIT 0` probe all succeed.

`embeddings_vec.rowid == embeddings.id` is enforced by application code; there
is no foreign key between the two. The worker inserts the metadata row
first and reuses its `id` as the vector rowid, binding it as `BigInt(...)`
because sqlite-vec's rowid insert rejects a plain JS number
(`src/worker/embeddings-handler.ts`, including the orphan-chunk deletes).
Reads assume the same identity: the k-NN queries in
`src/api/modules/retrieval/semantic-search.ts` and `semantic-search-helpers.ts`
join `embeddings e ON e.id = ev.rowid`.

The vector width is the literal `1536` inside `ensureEmbeddingsVecTable`; it is
not read from `embeddings.dimensions` or from `EMBEDDING_DIMENSIONS`, so a
model of another dimensionality needs a full re-embed against a rebuilt table.

## Commands

```bash
pnpm --filter @pops/cerebrum typecheck
pnpm --filter @pops/cerebrum test
pnpm --filter @pops/cerebrum build         # verify-manifest → tsc → openapi → api-types
pnpm --filter @pops/cerebrum dev           # tsx watch on src/api/server.ts
pnpm --filter @pops/cerebrum start         # node dist/api/server.js
pnpm --filter @pops/cerebrum start:worker  # node dist/worker/index.js
pnpm --filter @pops/cerebrum generate:openapi
pnpm --filter @pops/cerebrum generate:api-types
```

Redis is required to run the worker (set `REDIS_URL`); the API degrades
gracefully without it.
