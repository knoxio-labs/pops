# @pops/app-purchases

The frontend module for the purchases pillar. It registers `/purchases` with
`pillars/shell` and puts the pillar on the app rail.

Frontend-only: this package owns no database. Everything goes over the
purchases pillar's REST contract through the generated
`@hey-api/client-fetch` client in `src/purchases-api/`, served at the shell's
`/purchases-api` proxy path (see `src/purchases-api-runtime-config.ts`).

## What this is, and what it is not

This is the pillar's first frontend, and only that. `ReconcileQueuePage` is a
placeholder: it renders the route, resolves its copy from the catalog, and
says plainly that the queue is not built. It deliberately renders no sample
rows — a purchases surface showing invented transactions is worse than one
showing nothing, because an operator cannot tell the difference at a glance.

The generated client is committed and its base URL is pinned and tested, but
nothing calls it yet. That is on purpose: the first real call belongs with
the first real view, and having the client here means that view starts from a
typed surface and a proxy path already proven to line up.

## Layout

```
src/
  index.ts                         entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                      ModuleManifest (id='purchases')
  routes.tsx                       route table + navConfig
  purchases-api/                   generated Hey API client (do not hand-edit)
  purchases-api-runtime-config.ts  client baseUrl ('/purchases-api')
  pages/
    ReconcileQueuePage.tsx         /purchases — placeholder for the reconciliation queue
```

The generated client under `src/purchases-api/` is produced from
`pillars/purchases/openapi/purchases.openapi.json` and must not be edited by
hand. Regenerate it with `generate:purchases-client` after the contract
changes; CI diffs the committed output against a fresh run.

## Run

```sh
pnpm --filter @pops/app-purchases typecheck                 # tsc --noEmit
pnpm --filter @pops/app-purchases test                      # vitest run
pnpm --filter @pops/app-purchases test:watch                # vitest (watch)
pnpm --filter @pops/app-purchases test:coverage             # vitest run --coverage
pnpm --filter @pops/app-purchases generate:purchases-client # regen src/purchases-api
```

## Install gate

`@pops/app-purchases` exposes a single `.` export — `manifest`, `navConfig`,
and `routes`, all browser-safe. `pillars/shell` imports the `manifest` and
gates mounting on its `POPS_APPS` selection: adding `purchases` mounts the
module at `/purchases`, removing it hides those routes. No data lives in this
package, so uninstalling only removes the UI — purchase data stays in the
purchases pillar.

## Docs

- Pillar overview: [`pillars/purchases/README.md`](../README.md)
