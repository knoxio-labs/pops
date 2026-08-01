# @pops/pillar-sdk

Everything a pillar needs to take part in the federation without importing another pillar: the boot handshake that registers it with the `registry` pillar, the zod schema for the manifest it registers, the TTL'd discovery cache that answers "where is `finance` and is it up", and `pillar('finance').wishlist.list(input)` — a typed proxy that resolves a `[domain, procedure]` path against the target's OpenAPI document and issues one REST call.

Failure is a value, never a throw. Every call returns `CallResult<T>` and the caller narrows on `kind === 'ok'`; `unavailable`, `degraded` and `contract-mismatch` are the three ways a healthy caller sees an unhealthy federation. `.orThrow()` opts out, per call site.

## Entry points

`pillar()` is **not** on the root barrel. Import the surface matching where the code runs.

| Subpath            | What it is                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/server`          | backend-to-backend `pillar()` (service-account key, memoised handles) **and** `authenticateInternal`, the inbound guard for internal-only routes |
| `/client`          | the unauthenticated `pillar()` underneath it, plus `CallResult` / `PillarHandle`                                                                 |
| `/bootstrap`       | `bootstrapPillar()` — register with backoff, heartbeat, `/health`, deregister                                                                    |
| `/manifest-schema` | `ManifestPayload` + `validateManifestPayload` — the register wire format                                                                         |
| `/discovery`       | the registry snapshot cache and its SSE reconnect helper                                                                                         |
| `/settings`        | `discoverSettings()` — flattens the per-pillar settings contributions                                                                            |
| `/react`           | `PillarSdkProvider`, query-key derivation, SSE→React-Query invalidation                                                                          |

## Who depends on it

- **`registry`** — it is the other end of the handshake: it validates every inbound manifest with `validateManifestPayload` and mounts both `REGISTRY_PATHS` and `LEGACY_REGISTRY_PATHS`.
- **`shell`** — the only browser consumer. The root barrel feeds the boot path (`ManifestPayloadSchema` in `lib/registry-snapshot-fetch.ts`; `PillarSnapshot` / `NavConfigDescriptor` / `PageDescriptor` in `app/boot-snapshot.ts`, `app/installed-modules.ts`, `app/external-ui.tsx`), `/react` mounts `PillarSdkProvider` at the app root (`app/App.tsx`), and the settings page uses `/settings` (`discoverSettings`) plus `/client` + `/react` behind `useDynamicOptionsLoaders` and `useTestActionHandler`. Browser access to another pillar's domain data goes through a per-consumer generated Hey API client instead — see [ADR-040](../../docs/architecture/adr-040-cross-pillar-contract-discipline.md). `pillars/shell/scripts/generate-nginx-conf.ts` also reads discovery to render the proxy config.
- **`mcp`** — `/server` `pillar()` is the entire gateway; every MCP tool is a proxied pillar call.
- **`orchestrator`** — `/discovery` + `/server` for federated search; the root `buildToolList` for `GET /ai/tools`.
- **Cross-pillar reads** — `/client`: `finance` → contacts (`api/contacts/client.ts`), `finance` → registry (`api/cron/pillar-lookup.ts`), `inventory` → documents (`api/documents/client.ts`), `ai` nudge dispatch (`api/modules/ai-alerts/dispatchers/nudge.ts`). `/server`: `inventory`'s nightly URI reconciler (`api/cron/reconcile-cross-pillar.ts`) and `pillars/finance/scripts/migrate-core-entities.ts`. `inventory` therefore straddles both surfaces.
- **`food`, `ai`** — `/server` for `authenticateInternal` on their internal-only routes. They are its only call sites.
- **`libs/navigation`** — the `PillarId` type only.

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`). That is why the SDK addresses a target by string id and OpenAPI operationId rather than by its contract package: the type parameter on `pillar<TRouter>()` is supplied by the _caller_, who may legally depend on the contract.
- **`pillars/contacts` is a hand-written Rust twin of `/bootstrap`, `/manifest-schema` and `registry-path-resolver.ts`** (`src/manifest.rs`, `src/registry/`). Nothing keeps them in sync and nothing type-checks the Rust side against the zod schema. Tightening a rule here does not fail CI — it fails `contacts` at register time, in production.
- `zod` is the only runtime dependency. `react` and `@tanstack/react-query` are optional peers used solely by `/react`.

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
