# @pops/ai

The **ai** pillar — the platform's AI governance surface: providers, usage,
budgets, alerts, observability, and pricing. A standalone REST service that owns
its own SQLite DB (`ai.db`), serves a [ts-rest](https://ts-rest.com) contract
built from zod, exports a `./manifest`, and self-registers with the `registry`
pillar on boot. Port **3008**.

## Public surface

The package ships only its contract surface (`dist/contract/**` + the OpenAPI
snapshot). `exports`:

| Subpath       | Built from                            | Use                                 |
| ------------- | ------------------------------------- | ----------------------------------- |
| `.`           | `src/contract/index.ts`               | `aiContract` router + FE-safe types |
| `./manifest`  | `src/contract/manifest.ts`            | `aiManifest` `ModuleManifest`       |
| `./api-types` | `src/contract/api-types.generated.ts` | generated OpenAPI TS types          |
| `./openapi`   | `openapi/ai.openapi.json`             | canonical wire contract (JSON)      |

The contract (`src/contract/rest.ts`, zod) is the single source of truth;
the OpenAPI JSON and `api-types` are generated projections, drift-checked in CI.

## Domains

`src/api/modules/` and the matching `src/contract/rest-ai-*.ts` files:

- `ai-providers` — registered model providers + credentials.
- `ai-usage` — per-call usage records (the ingest surface writes here).
- `ai-budgets` — spend budgets.
- `ai-alerts` — budget / anomaly alerts.
- `ai-observability` — traces and metrics.
- pricing + settings round out the contract.

## Layout

```
pillars/ai/
├── package.json            @pops/ai
├── Dockerfile              runs dist/api/server.js
├── mise.toml               per-pillar tasks
├── app/                    @pops/app-ai — FE feature module
├── openapi/
│   └── ai.openapi.json     generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, modules, registry wiring
    └── db/         PRIVATE: drizzle schema + services + the ai.db opener
```

## Background work

Two periodic passes run behind env gates that are OFF by default: the alert
evaluator (`AI_ALERTS_SCHEDULER_ENABLED`, every 5 minutes) and the
observability summary + inference-log retention pass
(`AI_OBSERVABILITY_SCHEDULER_ENABLED`, hourly).

How they are scheduled depends on Redis, and Redis is optional here:

- **With `REDIS_URL` (or `REDIS_HOST`)** they are BullMQ repeatable jobs on the
  pillar's own `ai.maintenance` queue, consumed by a worker inside the API
  process — both tasks write this pillar's SQLite handle, which a separate
  worker container could not share. The schedule lives in Redis, so it
  survives a restart, and every boot reconciles rather than re-registers:
  an unchanged schedule is left alone, a changed cadence replaces in place,
  and a schedule whose gate has since been turned off is removed.
- **Without Redis** the pre-existing `setInterval` loops run instead
  (`src/api/modules/*/scheduler.ts`). The feature still works; its schedule
  simply restarts with the process.

A job that exhausts its three attempts moves to `ai.maintenance.dead-letter`
carrying its payload, failure reason, stack and attempt count, and is
replayable from there.

`/jobs` is the management surface over those queues — list, read, retry,
cancel, drain, per-state stats, and the dead-letter inbox. The routes are
declared once in `@pops/pillar-jobs` so every producing pillar exposes the same
shape; with no Redis they answer **503** rather than pretending an empty,
healthy queue. Nothing aggregates them across pillars yet (POPS-2006).

## Registration

On boot, when `POPS_REGISTRY_ENABLED=true`, the server registers via
`bootstrapPillar` from `@pops/pillar-sdk/bootstrap` (`POST /registry/register`
on the `registry` pillar) and deregisters on `SIGTERM`/`SIGINT`. It exposes
`/health`, a federated `/pillars` view, and the raw `/openapi` document.

Most routes trust the docker network and the gateway in front of it. The one
exception is the cross-pillar ingest `POST /ai-usage/record`: nginx never
proxies it, and it 403s any request missing the shared `x-pops-internal-token`,
so only sibling pillars carrying that token can write usage. The pricing read
`GET /ai-pricing/:provider/:model` stays open so callers can shape cost before
recording.

## Commands

```bash
pnpm --filter @pops/ai typecheck
pnpm --filter @pops/ai test
pnpm --filter @pops/ai build        # tsc + generate openapi + api-types
pnpm --filter @pops/ai dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/ai generate:openapi
pnpm --filter @pops/ai generate:api-types
```
