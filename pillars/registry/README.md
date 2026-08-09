# @pops/registry

The **registry** pillar — the single source of truth for which pillars are
currently running, plus settings, features, users, service accounts, and URI
resolution. Default port **3001** (override with `PORT`).

It is itself a pillar: it owns its own SQLite DB, serves a
[ts-rest](https://ts-rest.com) contract built from zod, and exports a
`./manifest` with id `registry`.

## Public surface

The published exports (`package.json`) point at the built `dist/contract`
output:

| Export        | Target                                 | What it is                     |
| ------------- | -------------------------------------- | ------------------------------ |
| `.`           | `dist/contract/index.js`               | FE-safe types + zod schemas    |
| `./manifest`  | `dist/contract/manifest.js`            | runtime `ModuleManifest` value |
| `./api-types` | `dist/contract/api-types.generated.js` | generated typed client surface |
| `./openapi`   | `openapi/registry.openapi.json`        | canonical wire contract (JSON) |

The ts-rest contract under `src/contract` (zod) is the single source of truth;
the OpenAPI JSON and `api-types` are generated projections, drift-checked in CI.

## REST surface

Every domain is served REST through one ts-rest contract (`src/contract/rest.ts`),
mounted root-relative: `features`, `serviceAccounts`, `settings`, `shell`, and
`users`.

## Discovery and registration

Pillars register through `@pops/pillar-sdk`'s `bootstrapPillar`, which POSTs the
manifest to the registry. Each handshake route is dual-served: the canonical
slash path and a legacy dotted alias point at the **same** handler instance, so
old- and new-SDK pillars register through identical logic.

| Concern    | Canonical                   | Legacy alias                     |
| ---------- | --------------------------- | -------------------------------- |
| register   | `POST /registry/register`   | `POST /core.registry.register`   |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` |
| snapshot   | `GET  /registry/pillars`    | `GET  /core.registry.list`       |

A registration envelope is `{ pillarId, baseUrl, manifest, capabilities? }`
where `manifest.pillar` MUST equal `pillarId` (a mismatch is rejected).
Consumers stream registry changes over Server-Sent Events at
`GET /registry/subscribe`: an initial `pillar.snapshot` frame, then
`pillar.registered`, `pillar.deregistered`, and `pillar.health-changed` frames.

Additional raw HTTP routes that ts-rest cannot model:

- `GET /health` — liveness probe.
- `GET /pillars` — the live pillar registry.
- `GET /pillars/health` — aggregated cross-pillar health, fanned out to every
  registered pillar.
- `POST /uri/resolve` — cross-pillar URI dispatcher (resolves in-process or
  proxies to the owning pillar).
- `GET /openapi` — serves the committed OpenAPI projection verbatim so the
  pillar SDK can build its route map from the live pillar.
- `GET /service-accounts/self` — resolves the presenting `X-API-Key` to its
  account (`{ id, name, scopes }`), or 401. See below.

## Service-account introspection

The registry owns the `service_accounts` table, so no other producer can turn a
presented `X-API-Key` into a principal on its own. `GET /service-accounts/self`
is how they ask: a pillar forwards the key it received and gets back the account
it resolves to. `@pops/pillar-sdk/server`'s
`createRegistryServiceAccountVerifier` is the client half, and the path is
shared through `REGISTRY_SERVICE_ACCOUNT_SELF_PATH` so the two cannot drift.

It authenticates through the same identity-middleware leg the rest of the REST
surface uses, which is also where revocation is checked — so a revoked key stops
resolving here immediately, and asking pillars learn it within their verifier's
cache TTL. Presenting the key is the price of admission, so the route reveals
nothing a caller could not learn by using the key directly.

It is a raw route rather than a contract route, like `POST /uri/resolve`: a
machine-to-machine federation primitive, kept out of the OpenAPI projection the
frontend clients are generated from. The contract's `GET /service-accounts`
list is a different, `userOnly` route and is unaffected.

Which producers act on the answer is [ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md):
`registry` and `finance` today, the rest under their own issues.

## Human identity (Cloudflare Access)

`src/api/middleware/identity.ts`'s `resolvePrincipal` is the one place the
human-principal resolution order is written down: `x-api-key` service
account, then (non-production) a dev fallback user, then — **only when
`CLOUDFLARE_ACCESS_TEAM_NAME` is unset** — a `tunnel-authenticated@pops.local`
principal, then a verified `cf-access-jwt-assertion`, then anonymous.

The tunnel-user fallback is deliberate, not a placeholder: the registry is
reachable only from inside the `pops-backend`/`pops-frontend` Docker networks
and through the shell's Cloudflare Access-protected proxy, so "no team name
configured" is read as "Access isn't configured for this environment yet, but
the network boundary still holds". `bfm` (see
[`pillars/bfm/README.md`](../bfm/README.md#the-perimeter)) makes the opposite
choice for the same missing variable, because its own hostname bypasses Access
so the phone can pair — carrying the registry's fallback over there would hand
every caller on the public internet an operator session. There is no such
bypassed hostname in front of the registry, which is what makes the fallback
safe here and not there.

`infra/docker-compose.yml`'s `registry-api` service forwards both
`CLOUDFLARE_ACCESS_TEAM_NAME` and `CLOUDFLARE_ACCESS_AUD` from the host
environment, the same way `bfm-api`'s does — setting either only in an
operator's `.env` does nothing for a container whose compose block never
declares it. Until an operator sets `CLOUDFLARE_ACCESS_TEAM_NAME` in the
deployed environment, `GET /service-accounts` and the rest of the `userOnly`
surface authenticate through the tunnel-user fallback rather than a verified
Access identity; wiring a value in is an operator step, not a code change.

## Registration trust model

`register`, `heartbeat` and `deregister` carry no per-request credential — the
SDK's bootstrap transport sends `content-type` and nothing else, and
`api_key_hash` is written `null`. The handlers attribute this to
[ADR-027](../../docs/architecture/adr-027-runtime-pillar-registry.md), "the
docker network is the boundary"; the ADR's own text covers the
push-with-heartbeat decision and never discusses a trust boundary, so the
handler comments are where that model is actually written down.

The public shell nginx proxies the read-only surface (`/pillars`,
`/pillars/health`, `/registry/subscribe`) and mounts no location for
`/registry/{register,heartbeat,deregister}` or their dotted aliases — the
omission is deliberate and commented in the generated `pillars/shell/nginx.conf`.
It is not a seal. The generic `/registry-api/` block strips its own prefix and
forwards whatever follows, so `POST /registry-api/registry/register` still lands
on the register handler from outside the network.

`register` UPSERTs on `pillar_id` and always passes `origin = 'external'`
(`external-registry/register.ts`). The two guards keyed on that value are
inert: deregister's
`403 internal-pillar-not-deregisterable-externally` and the eviction ticker's
refusal to hard-evict a non-external row.

Nothing rejects a register whose `pillarId` collides with an in-tree pillar. The
only checks are `PILLAR_ID_PATTERN`, the manifest schema, and
`manifest.pillar === pillarId`, so an in-network caller can overwrite a core
pillar's `base_url` and manifest by registering under its id.

## Modules

`src/api/modules/`:

- `registry` — the live pillar registry (boot reconcile, event bus, heartbeat
  and eviction tickers, snapshot, SSE subscribe).
- `external-registry` — the register / heartbeat / deregister handlers external
  pillars call.
- `features` — feature flags, including capability-scoped features and key
  ownership enforcement.
- `service-accounts` — service-account keys used for inter-pillar auth.
- `uri` — URI type parsing and resolution.

## Layout

```
pillars/registry/
├── package.json            @pops/registry
├── Dockerfile              runs dist/api/server.js
├── mise.toml               per-pillar tasks
├── migrations/             SQLite schema migrations
├── openapi/
│   └── registry.openapi.json   generated projection of the contract
├── scripts/                generate-openapi.ts, generate-api-types.ts
└── src/
    ├── contract/   PUBLIC: ts-rest contract, types, zod schemas, manifest
    ├── api/        PRIVATE: Express server, ts-rest handlers, the registry modules
    └── db/         PRIVATE: drizzle schema + services + the SQLite opener
```

## Commands

```bash
pnpm --filter @pops/registry typecheck    # tsc --noEmit (src + scripts)
pnpm --filter @pops/registry test         # vitest run
pnpm --filter @pops/registry build        # tsc -b + generate openapi + api-types
pnpm --filter @pops/registry dev          # tsx watch on src/api/server.ts
pnpm --filter @pops/registry start        # node dist/api/server.js
pnpm --filter @pops/registry generate:openapi
pnpm --filter @pops/registry generate:api-types
```
