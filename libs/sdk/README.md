# @pops/pillar-sdk

Everything a pillar needs to take part in the federation without importing another pillar: the boot handshake that registers it with the `registry` pillar, the zod schema for the manifest it registers, the TTL'd discovery cache that answers "where is `finance` and is it up", and `pillar('finance').wishlist.list(input)` — a typed proxy that resolves a `[domain, procedure]` path against the target's OpenAPI document and issues one REST call.

Failure is a value, never a throw. Every call returns `CallResult<T>` and the caller narrows on `kind === 'ok'`; `unavailable`, `degraded` and `contract-mismatch` are the three ways a healthy caller sees an unhealthy federation. `.orThrow()` opts out, per call site.

## Entry points

`pillar()` is **not** on the root barrel. Import the surface matching where the code runs.

| Subpath            | What it is                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/server`          | backend-to-backend `pillar()` (service-account key, memoised handles) **and** the two inbound guards — `authenticateInternal` and the service-account scope gate below                                                                                                                                                         |
| `/client`          | the unauthenticated `pillar()` underneath it, plus `CallResult` / `PillarHandle`                                                                                                                                                                                                                                               |
| `/bootstrap`       | `bootstrapPillar()` — register with backoff, heartbeat, `/health`, deregister — and `shutdownPillar()`, the SIGTERM half: every step settles (a failed one is logged, never fatal), then the server drains, then the database closes and checkpoints its WAL                                                                   |
| `/manifest-schema` | `ManifestPayload` + `validateManifestPayload` — the register wire format                                                                                                                                                                                                                                                       |
| `/discovery`       | the registry snapshot cache and its SSE reconnect helper                                                                                                                                                                                                                                                                       |
| `/settings`        | `discoverSettings()` — flattens the per-pillar settings contributions                                                                                                                                                                                                                                                          |
| `/access`          | Cloudflare Access JWT verification — the operator half of a pillar's identity. Node-only; see below                                                                                                                                                                                                                            |
| `/react`           | `PillarSdkProvider`, query-key derivation, SSE→React-Query invalidation                                                                                                                                                                                                                                                        |
| `/db`              | the database safety mechanisms every pillar that owns a SQLite file composes: `withPreMigrationBackup` (snapshot before applying pending migrations), `assertDestructiveCommandAllowed` (the refusals on a wipe), and the journal readers underneath them. Node-only; see below                                                |
| `/testing`         | test doubles for a `pillar()` consumer (stub discovery, `fakePillarHandle`) plus a real-process harness — `spawnPillarProcess`, `startRecordingProxy`, `waitForRegistration`, `resolvePillarDir` — for the handful of tests that must prove a `pillar()` call reaches a real, separately-booted peer over the wire, not a stub |

`/db` is the second outlier, and for the same reason: it is not about reaching the federation either. It exists because every pillar migrates its own SQLite file on startup, inside a container, with nobody watching — so the two mechanisms that make that survivable have to live in one place instead of ten. `withPreMigrationBackup` takes a `VACUUM INTO` snapshot immediately before drizzle applies pending journal entries, deletes it when they all land, and preserves it with its path logged when one throws; it skips the snapshot entirely when nothing is pending, when the database has no schema of its own (the first-ever mount of a data volume) and for in-memory databases. `assertDestructiveCommandAllowed` refuses a destructive script under `NODE_ENV=production` — never waivable — and against a database whose key tables already hold rows, which `FORCE=true` waives after printing what is about to be destroyed.

Nothing in it imports `better-sqlite3` or `drizzle-orm`. The connection is a structural interface a `better-sqlite3` handle already satisfies, and the migration apply is a callback, which is what keeps a native dependency out of the four pillars here that own no database. Its own tests run against Node's built-in `node:sqlite` for the same reason. The operator's half of both mechanisms — how to restore a preserved snapshot, and what is safe to run against a live pillar — is [`docs/runbooks/pillar-go-live.md`](../../docs/runbooks/pillar-go-live.md).

`/access` is the outlier in this table: it is not about reaching the federation at all. It verifies the `cf-access-jwt-assertion` header Cloudflare Access forwards after terminating a human login at the edge, which is how a pillar answers "is this a real operator". It lives here because the alternative is a copy per pillar, and a signature check that exists twice drifts in the copy nobody is reading. `registry` and `bfm` both consume it.

Three properties in `createCloudflareAccessVerifier` are load-bearing, each with its own way of being lost, and the file states them at length: the algorithm is **pinned** to RS256 rather than read from the token header (the `alg: none` and HMAC-with-the-public-key confusion classes); the `aud` is checked whenever one is configured, because Access mints one JWT per application off the same team keys, so a token for a _sibling_ protected app carries a perfectly valid signature; and the JWKS cache is per-verifier rather than module-global. Widening any of them is a security change, not a refactor — `src/access/__tests__/cloudflare-jwt.test.ts` asserts each against real generated keypairs.

It is the only subpath that pulls a non-`zod` runtime dependency (`jsonwebtoken`), and it is Node-only. Import it from a pillar's API layer, never from a frontend app.

## The two inbound guards

`/server` sends a credential and, since [ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md), also checks one. They are different credentials and answer different questions, so a producer picks by what it is protecting:

- **`authenticateInternal`** — a static, compiled caller list. The callee names the callers it accepts, each presenting `name.secret` in `x-pops-internal-credential`, and blanking the secret's env var revokes one. Right for a handful of paths siblings may reach and nobody else, where the caller set is a fact of the architecture: `ai`'s telemetry sink, `food`'s worker callbacks.
- **The service-account scope gate** — `buildContractScopeMap` + `authorizeServiceAccountRequest` + `createRegistryServiceAccountVerifier`. The credential is the same `X-API-Key` `pillar()` already attaches, resolved against the registry's account table, so grants are central and auditable and revocation lands everywhere. Right for a producer's whole contract surface.

The scope gate splits into three pieces so a producer can replace any one of them. `buildContractScopeMap(router, pillarId)` derives `(method, path) → dotted scope` from the ts-rest contract itself — a new route is gated the moment it exists, which a hand-kept path list cannot promise. `authorizeServiceAccountRequest` is pure over an already-read header, so the SDK stays free of any HTTP framework; the Express binding over it lives in [`@pops/pillar-express`](../pillar-express/README.md), which is where the `express` dependency is allowed to be. An adopting producer supplies three things — its contract, its root scope, its log prefix — and picks its own `requireCredential` posture, as `pillars/finance/src/api/middleware/service-account-scope.ts` and `pillars/purchases/src/api/middleware/service-account-scope.ts` do. `createRegistryServiceAccountVerifier` does the lookup against `GET /service-accounts/self` and caches by key digest, because a registry round-trip per inbound request would put the registry on the critical path of every cross-pillar call.

Two behaviours are deliberate and should not be softened without revisiting the ADR. A presented key that cannot be verified yields `503` rather than admission — the guard never falls back to network trust once a credential is in play, so the registry being down degrades an adopting producer instead of opening it. And a request presenting **no** key is not gated by default: browser traffic arrives through the shell's nginx with no `X-API-Key`, so `requireCredential` is opt-in, for a producer whose callers are all credentialled.

## Who depends on it

- **`registry`** — it is the other end of the handshake: it validates every inbound manifest with `validateManifestPayload` and mounts both `REGISTRY_PATHS` and `LEGACY_REGISTRY_PATHS`. Also `/access`, for the Cloudflare Access leg of `api/middleware/identity.ts`.
- **`bfm`** — `/access` for its operator surface. Its chain deliberately drops the registry's tunnel fallback, because bfm's own hostname bypasses Access; `pillars/bfm/src/api/middleware/identity.ts` says why.
- **`shell`** — the only browser consumer. The root barrel feeds the boot path (`ManifestPayloadSchema` in `lib/registry-snapshot-fetch.ts`; `PillarSnapshot` / `NavConfigDescriptor` / `PageDescriptor` in `app/boot-snapshot.ts`, `app/installed-modules.ts`, `app/external-ui.tsx`), `/react` mounts `PillarSdkProvider` at the app root (`app/App.tsx`), and the settings page uses `/settings` (`discoverSettings`) plus `/client` + `/react` behind `useDynamicOptionsLoaders` and `useTestActionHandler`. Browser access to another pillar's domain data goes through a per-consumer generated Hey API client instead — see [ADR-040](../../docs/architecture/adr-040-cross-pillar-contract-discipline.md). `pillars/shell/scripts/generate-nginx-conf.ts` also reads discovery to render the proxy config.
- **`mcp`** — `/server` `pillar()` is the entire gateway; every MCP tool is a proxied pillar call.
- **`orchestrator`** — `/discovery` + `/server` for federated search; the root `buildToolList` for `GET /ai/tools`.
- **Cross-pillar reads** — `/client`: `finance` → contacts (`api/contacts/client.ts`), `finance` → registry (`api/cron/pillar-lookup.ts`), `inventory` → documents (`api/documents/client.ts`), `ai` nudge dispatch (`api/modules/ai-alerts/dispatchers/nudge.ts`). `/server`: `inventory`'s nightly URI reconciler (`api/cron/reconcile-cross-pillar.ts`) and `pillars/finance/scripts/migrate-core-entities.ts`. `inventory` therefore straddles both surfaces.
- **`food`, `ai`** — `/server` for `authenticateInternal` on their internal-only routes. They are its only call sites.
- **Every pillar that owns a SQLite file** — `/db`: `withPreMigrationBackup` in each `open-<id>-db.ts`, and `assertDestructiveCommandAllowed` in `pillars/food/scripts/db-seed-food.ts`, the one destructive script that wipes rather than truncates.
- **`finance`, `purchases`** — `/server` for the service-account scope gate over their whole contract surfaces (`api/middleware/service-account-scope.ts` in each), bound to Express by `@pops/pillar-express`. Both hold `requireCredential: false`. The remaining producers adopt under their own Huly issues.
- **`libs/navigation`** — the `PillarId` type only.

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`). That is why the SDK addresses a target by string id and OpenAPI operationId rather than by its contract package: the type parameter on `pillar<TRouter>()` is supplied by the _caller_, who may legally depend on the contract.
- **`pillars/contacts` is a hand-written Rust twin of `/bootstrap`, `/manifest-schema` and `registry-path-resolver.ts`** (`src/manifest.rs`, `src/registry/`). Nothing keeps them in sync and nothing type-checks the Rust side against the zod schema. Tightening a rule here does not fail CI — it fails `contacts` at register time, in production.
- `zod` is the runtime dependency everywhere except `/access`, which adds `jsonwebtoken`. `react` and `@tanstack/react-query` are optional peers used solely by `/react`.

## What first-time consumers get wrong

- **Backend code reaching for `/client` gets no auth.** The existing cross-pillar clients in `finance` and `inventory` import `pillar()` from `/client`, so copying them silently drops the service-account header, the internal-base-URL overrides, and the per-process handle cache. Backend callers want `/server`.
- **The proxy path carries no pillar prefix.** `pillar('finance').wishlist.list` resolves operationId `wishlist.list` in finance's own document. Fewer than two segments is a `contract-mismatch`, not a runtime error.
- **A pillar serving no `/openapi` reports `contract-mismatch`, not `unavailable`.** "Registered but uncallable" and "not answering" are deliberately distinct.

## Server call-site conventions

Nothing about a `pillar()` call throws on failure, so a floating promise discards
the failure discriminant in silence.

`PillarCallError` is constructed in exactly one place, the `.orThrow()` wrapper in
`client/proxy.ts`. No production call site calls `.orThrow()`. Each branches on
`CallResult` and translates into its own vocabulary instead: `finance`'s contacts
client splits the kinds into `ContactsUnavailableError` (retryable — the import
path degrades to an outbox row) and `ContactsPermanentError`; its cron adapter
folds them to `ok` / `not-found` / `bad-uri` / `unavailable`; the best-effort
paths log the kind and carry on. Catching `PillarCallError` is purely defensive —
`inventory`'s reconciler is the only place that does.

Two unrelated classes share the name `PillarCallError`. The root barrel exports
the one from `capabilities/call-result.ts` (carries `.cause`; has a
`validation-error` kind); `/client` and `/server` export the one from
`client/errors.ts` (carries `.pillarId` and `.result`; has `conflict`,
`bad-request` and `unauthorized` kinds). `CallResult` is likewise two different
unions. An `instanceof` check against the wrong import never matches, and fails
quietly.

## Unavailable-classification is not the SDK's

The `unavailable` discriminant covers `pillar()` calls only. A pillar app's own
browser traffic goes through its generated Hey API client, which the SDK never
sees, and the classification for that lives in eight hand-written copies:
`pillars/{ai,cerebrum,finance,food,inventory,media}/app/src/<id>-api-helpers.ts`,
`pillars/shell/src/registry-api-helpers.ts`, and
`libs/overlay-ego/src/ego-api-helpers.ts`. Each exports its own
`isUnavailableError` as an `instanceof` test against its own `<Pillar>ApiError`
class, so there is no shared type for the SDK to own without first unifying those
classes. The copies have drifted: three check `status === 503` separately from
the `status >= 500` that already covers it.

## Unconsumed

`/orchestrator` (`runFederatedSearch`, `publishEvent`) and `/ranking` (`mergeResults`) have no consumer in the tree. The `orchestrator` pillar federates search itself in `pillars/orchestrator/src/search/federation.ts` over `pillar(id).search.search`, and no pillar declares a `sinks` manifest entry or mounts a `_sinks` route, so the event dispatcher has nothing to dispatch to. `/testing/discovery` is exercised only by its own test.
