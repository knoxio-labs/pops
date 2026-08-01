# @pops/finance

The **finance** pillar — transactions, budgets, wishlist, CSV/Up Bank import,
tag rules/suggestions, and AI-assisted corrections. A standalone REST service
that owns its own SQLite DB (`finance.db`, opened via `openFinanceDb`), serves a
[ts-rest](https://ts-rest.com) contract built from zod, exports its manifest,
and self-registers with the `registry` pillar on boot. Port **3004**. Merchant
entities live in the `contacts` pillar; finance keeps no entities table of its
own — it reads them over HTTP and create-or-fetches by name (creating a contact
only when none already matches) during import.

## How the domain works

Behaviour is documented next to the code that implements it:

| Read this                                                               | For                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`src/api/modules/imports/`](src/api/modules/imports/README.md)         | The import pipeline and the classification ladder              |
| [`src/api/modules/corrections/`](src/api/modules/corrections/README.md) | Learned classification rules and the ChangeSet proposal engine |
| [`src/api/modules/tag-rules/`](src/api/modules/tag-rules/README.md)     | Tag rules, and the boundary against correction rules           |
| [`app/src/components/imports/`](app/src/components/imports/README.md)   | The eight-step import wizard and its local-first buffering     |

Other directories carry no README on purpose — their file headers already explain them. Start with a file's header comment before its body.

## Public surface

The package ships only its contract and the OpenAPI snapshot (`package.json`
`files`). The `exports` map points at the built `dist/` artifacts:

```jsonc
"exports": {
  ".":          dist/contract/index.js              // FE-safe types + zod schemas
  "./manifest": dist/contract/manifest.js           // ModuleManifest value + FinanceContract type
  "./api-types":dist/contract/api-types.generated.js
  "./openapi":  openapi/finance.openapi.json        // canonical wire snapshot
}
```

The wire surface is the ts-rest contract (`src/contract/rest.ts`). It is the
single source of truth:
`pnpm -F @pops/finance generate:openapi` projects it to
`openapi/finance.openapi.json`, and `generate:api-types` projects that JSON to
`src/contract/api-types.generated.ts`. No hand-authored OpenAPI, no
hand-authored paths; CI gates on drift.

## Domains

The contract (`src/contract/rest.ts`) composes these sub-routers:

| Domain         | Surface                                                       |
| -------------- | ------------------------------------------------------------- |
| `transactions` | `/transactions`, `/transactions/:id`, `/transactions/restore` |
| `budgets`      | `/budgets`, `/budgets/:id`                                    |
| `wishlist`     | `/wishlist`, `/wishlist/:id`                                  |
| `imports`      | CSV / Up Bank import + atomic commit                          |
| `tagRules`     | tag rules + suggester                                         |
| `corrections`  | AI-assisted correction proposals                              |
| `entityUsage`  | read-only usage counts for `contacts` entities                |
| `search`       | cross-domain search                                           |
| `settings`     | per-pillar settings                                           |

## Layout

```
pillars/finance/
├── package.json            @pops/finance
├── Dockerfile              runs dist/api/server.js
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-finance — FE feature module
├── openapi/
│   └── finance.openapi.json   generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, registry wiring
    └── db/         PRIVATE: drizzle schema + services + openFinanceDb
```

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk` (`/registry/register` on the
`registry` pillar) and deregisters on `SIGTERM`. There is no per-request auth:
the pillar trusts the docker network and the gateway in front authenticates.

## Commands

```bash
pnpm --filter @pops/finance typecheck
pnpm --filter @pops/finance test          # vitest — db services + REST integration (supertest)
pnpm --filter @pops/finance build         # tsc + generate openapi + api-types
pnpm --filter @pops/finance dev           # watch-run the API server
pnpm --filter @pops/finance generate:openapi
pnpm --filter @pops/finance generate:api-types
```
