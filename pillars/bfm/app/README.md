# @pops/app-bfm

The frontend module for the **bfm** (Backend-for-Mobile) pillar. It registers
the `/bfm` route with `pillars/shell` and renders the operator's device
surface.

The rail entry reads **Devices**. `bfm` stays the pillar id everywhere in code
— package name, manifest id, `navConfig.id`, the `/bfm` base path — but the
acronym means nothing to a human, and the surface is a list of paired phones.
The `ai` pillar carries the same split (id `ai`, name "AI Ops").

The surface lives in the shell rather than on the phone on purpose: the shell
already sits behind Cloudflare Access, which is what makes "only the operator
can mint a pairing code" true.

Frontend-only: this package owns no database. Everything goes over the bfm
pillar's REST contract through the generated `@hey-api/client-fetch` client in
`src/bfm-api/`, served at the shell's `/bfm-api` proxy path
(see `src/bfm-api-runtime-config.ts`). Because the app consumes its **own**
pillar, there is no cross-pillar client leg and nothing to add to the
`cross-pillar-clients` CI job.

## Layout

```
src/
  index.ts                    entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                 ModuleManifest (id='bfm')
  routes.tsx                  route table + navConfig
  bfm-api/                    generated Hey API client (do not hand-edit)
  bfm-api-helpers.ts          unwrap() + isUnavailableError()
  bfm-api-runtime-config.ts   client baseUrl ('/bfm-api')
  pages/
    DevicesPage.tsx           /bfm — placeholder; the real page is POPS-1387
```

`bfm-api-helpers.ts` is deliberately a per-pillar copy rather than a shared
import: what counts as "unavailable" is a pillar-local judgement and the SDK
does not own that classification.

## Current state

`DevicesPage` is a placeholder. Pairing QR, the device list and revoke are
their own ticket. What it does render is the pillar's reachability, driven by
the real generated client, the real `/bfm-api` path and the real
`isUnavailableError` classification — so a wrong `baseUrl` or a missing proxy
fails here, visibly, instead of surfacing later as a pairing bug.

It distinguishes three failure shapes on purpose:

| State       | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| Reachable   | `/health` answered.                                              |
| Unavailable | No status, or 5xx — the pillar is down.                          |
| Refused     | A status the pillar chose (404, 403 …) — routing/auth, not down. |

Collapsing the third into "Unavailable" would send the operator after the
wrong bug.

## Run

```sh
pnpm --filter @pops/app-bfm typecheck
```

```sh
pnpm --filter @pops/app-bfm test
```

```sh
pnpm --filter @pops/app-bfm generate:api
```

The generated client under `src/bfm-api/` is produced from
`pillars/bfm/openapi/bfm.openapi.json` and must not be edited by hand.
Regenerate it with `generate:api` after the contract changes — the same spec
the generated Swift client is built from, so the two clients cannot disagree
about the wire.

## Install gate

`@pops/app-bfm` exposes a single `.` export — `manifest`, `navConfig` and
`routes`, all browser-safe. `pillars/shell` imports the `manifest` and gates
mounting on its `POPS_APPS` selection: adding `bfm` mounts the module at
`/bfm`, removing it hides those routes. No data lives in this package, so
uninstalling only removes the UI — device and token rows stay in the bfm
pillar.

## Docs

- Pillar overview: [`pillars/bfm/README.md`](../README.md)
