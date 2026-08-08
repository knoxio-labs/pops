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

## Who may call it

Auth splits by whether the caller presents a credential, and the split is the
whole design ([ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md)).

A request carrying **no** `X-API-Key` is served as before: the shell's nginx and
Cloudflare Access are the perimeter for browser traffic, and finance does not
re-litigate it. Closing that path is a separate decision about the
docker-network trust boundary.

A request carrying one is a machine, and is held to the service account behind
that key. `src/api/middleware/service-account-scope.ts` resolves it against the
registry and refuses any operation the grant does not cover. The required scope
is derived from `financeContract` itself, so every contract route is gated the
moment it exists and there is no second list to update; `/health`, `/pillars`,
`/openapi` and the signature-checked Up webhook are outside the contract and
are untouched.

Failure modes, in the order they bite: an unrecognised or revoked key is `401`;
a live account whose grant does not reach the operation is `403`, logged with
the account name and the exact scope it was missing, which is the instruction
for widening it; a registry that cannot be reached is `503`, because a
credential that cannot be verified is never waved through.

The one account with a repo-declared grant is `bfm`'s
(`pillars/bfm/src/api/pillars/service-account.ts`, `finance.transactions`),
which covers the two calls bfm makes. Accounts minted by an operator — notably
the `pops_api_key` shared by the `mcp` and `moltbot` compose profiles — are not
visible from this repo, so a profile that reaches finance with a narrower grant
than its traffic will see the `403` above (POPS-1551).

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
`registry` pillar) and deregisters on `SIGTERM`.

## Commands

```bash
pnpm --filter @pops/finance typecheck
pnpm --filter @pops/finance test          # vitest — db services + REST integration (supertest)
pnpm --filter @pops/finance build         # tsc + generate openapi + api-types
pnpm --filter @pops/finance dev           # watch-run the API server
pnpm --filter @pops/finance generate:openapi
pnpm --filter @pops/finance generate:api-types
```
