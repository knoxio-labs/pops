# ADR-026: Per-Domain Pillar Architecture

## Status

Accepted — 2026-06-09

## Context

A workspace audit during PRD-120 part A surfaced multiple architectural smells that share a common root cause: there is no agreed pattern for "where does a domain's code live, and how do domains talk to each other".

**The smells observed:**

1. **Three different patterns for backend services.** Finance / media / inventory / cerebrum keep services in `apps/pops-api/src/modules/<domain>/`. Food keeps them in `packages/app-food/src/db/`. Lists keeps them in `packages/app-lists/src/db/` but has no frontend at all.
2. **`@pops/app-lists` is misnamed.** It's a backend-only data package wearing the `app-*` namespace.
3. **`@pops/app-food` is a frankenstein.** It mixes React frontend, backend persistence, jobs, storage helpers, the DSL pipeline, and a `server.ts` subpath as a band-aid so `pops-api` can consume the backend bits without dragging React into its dep graph.
4. **A latent cycle through `@pops/api`.** `@pops/api-client` imports `AppRouter` from `pops-api`. Every `app-*` package depends on `api-client`. The moment `pops-api` depends on any `app-*` package — which it must for tRPC routers — the cycle closes. PRD-122-API hit it in turbo and pivoted by extracting `@pops/app-food-db`, which treats the symptom domain-by-domain but doesn't fix the layering.
5. **`@pops/db-types` is monolithic.** 67 schema files spanning every domain. A schema change in any one rebuilds the world.
6. **Two parallel "module manifest" systems** (frontend in `app-*/src/manifest.ts`, backend in `pops-api/src/modules/<domain>/index.ts`) with no enforced parity. `@pops/app-lists` has no frontend manifest at all.
7. **`pops-storybook` enumerates only 3 of 7 `app-*` packages**, captured as issue #2706.

The drift accumulated because every PRD made a locally-reasonable choice. Without a written pattern, future PRDs will keep doing the same.

## Decision

POPS adopts a **per-domain pillar architecture**. Each domain is a fully-isolated pillar that ships, deploys, and runs independently. Cross-pillar communication happens exclusively via the platform URI scheme and per-pillar typed contracts. There is no shared database, no shared backend process, no shared `AppRouter` type, and no cross-pillar source imports — pillars consume each other only through a published contract.

### Pillar shape — one directory per domain

Each domain lives under `pillars/<id>`, not in four separate packages: a server package (`@pops/<id>`) that separates by directory — `src/db` (drizzle schema + services), `src/contract` (zod schemas, ts-rest contract, manifest), `src/api` (handlers, jobs) and `migrations/` — plus a sibling frontend package at `pillars/<id>/app` (`@pops/app-<id>`). Cross-pillar contracts are REST over OpenAPI (ts-rest → OpenAPI projection), not a shared TypeScript package — see [ADR-033](./adr-033-cross-language-pillar-contracts.md), which generalises this for non-TypeScript pillars.

**Cross-pillar dep graph:**

A pillar may consume another pillar's contract only — as a generated REST client (frontend) or through `@pops/pillar-sdk`'s `pillar()` (backend-to-backend). Importing another pillar's `src/db`, `src/api`, or `app/` source from anywhere is forbidden.

### Pillar isolation — runtime

- **Each pillar runs in its own Node process / container.**
- **Each pillar owns its own SQLite database.** No cross-pillar FKs. Litestream replicates each DB independently.
- **The URI resolver is pillar-aware.** A URI `pops:food/recipe/<id>` is dispatched to the food pillar's `/uri/resolve` endpoint. If the food pillar is not running, the resolver returns `pillar-unavailable` and the consumer renders a "domain not installed" placeholder rather than failing.
- **No global router or client type.** Each pillar serves its own ts-rest contract, projected to OpenAPI. `pops-shell` and each pillar's own `app/` consume a generated Hey API REST client per pillar. Backend-to-backend calls go through `@pops/pillar-sdk`'s `pillar('<id>')`.
- **Workers, jobs, cron tasks owned by a pillar live in that pillar's own package.** A pillar's worker container is the same image as its api container, just running a different entrypoint.

### Internal contracts — the boundaries within a pillar

| Boundary           | Compile-time                                                                                                                                       | Runtime                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **db → contract**  | `drizzle-zod` derives row schemas from drizzle tables. `src/contract` imports and `.pick()`/`.extend()`s the public surface from `src/db`.         | None — no wire crosses. Drift caught at build via TS inference.                                                 |
| **contract → api** | ts-rest contract routes reference `contract` zod schemas for both request and response; `RouterImplementation` type-checks handler return shapes.  | Every request is zod-parsed at the boundary. Responses are not re-parsed (ts-rest `responseValidation` is off). |
| **api → ui**       | The pillar's own `app/` (and any consumer) imports a Hey API client generated from the pillar's OpenAPI snapshot — regenerated on contract change. | None — the generated client types responses but does not validate them.                                         |

**Key rules:**

1. **drizzle-zod is the single source of truth at the persistence layer.** `src/contract` derives from `src/db`'s drizzle-zod export, never hand-authors a parallel schema for the same row.
2. **Every route's request is validated against the contract schema at runtime; its response shape is enforced at compile time only.** A handler that drifts from the contract fails typecheck; nothing re-parses the response on the wire.
3. **Form validation in `app/` uses zod schemas from `src/contract`** so the ui and the api validate identical shapes from one source.

### Cross-pillar contracts

The only cross-pillar artifacts:

| Artefact                               | Owner        | Consumed by                                          | Mechanism                                                                                 |
| -------------------------------------- | ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| URI scheme `pops:<pillar>/<type>/<id>` | the registry | every pillar that references foreign entities        | runtime HTTP call to the owning pillar's `/uri/resolve`                                   |
| pillar OpenAPI contract                | the pillar   | other pillars, iOS, MCP, web clients                 | generated REST client (Hey API) or vendored snapshot                                      |
| pillar manifest                        | the pillar   | `pops-shell` (UI install set), the `registry` pillar | build-time `@pops/module-registry` (shell); self-registration on boot (registry, ADR-027) |

**Forbidden:**

- Another pillar's `src/db`, `src/api`, or `app/` source imported from anywhere outside that pillar.
- Cross-pillar SQL queries or joins. Cross-pillar references happen via the URI scheme and the consumer's pillar fetches the foreign data over the wire if it needs to display it.

### The registry is a normal pillar

`registry` follows the same shape as every other pillar and owns:

- The pillar registry — `pillar_registry` (SQLite), populated by push-on-boot registration and heartbeat (ADR-027); `POPS_PILLARS` is only a seed fallback.
- The URI dispatcher — fans out `pops:<pillar>/...` to the owning pillar based on the URI's pillar prefix.
- Platform-wide primitives (settings, service accounts) that don't belong to a single domain.

## Consequences

### Positive

- **True crash isolation.** A bug in food never affects finance.
- **Independent deploys.** Update food alone; finance keeps running.
- **Per-pillar Litestream backups.** Each pillar's DB is a separate stream. (Operational isolation of storage and backup — the physical substrate is still shared today — is specified by [ADR-039](adr-039-pillar-isolation.md).)
- **Forced discipline.** Cross-pillar coupling becomes structurally impossible. Reviewers don't have to look for it.
- **CI narrows naturally.** A change inside `pillars/food` triggers food's tests plus those of the few units that consume its contract.
- **External consumers (iOS, MCP, future web clients) consume each pillar's contract independently** and don't need to know about other pillars.
- **Pillars can be extracted to separate hosts trivially.** Run food on a Pi, run finance on the main server. No code change.
- **PRD-120 issue (no shell page mounting the editor yet) and PRD-110 issue (Litestream YAML in a separate repo) become per-pillar concerns**, not platform-wide blockers.

### Negative

- **Cross-pillar queries are network calls.** Localhost adds ~1-3 ms per call. Imperceptible at single-user scale but it's a real constraint.
- **No FKs across pillars.** Referential integrity becomes the application's responsibility. A food recipe referencing a deleted shopping list will return a "lists-pillar reports not-found" instead of failing at INSERT time.
- **"Show me everything related to X" requires fan-out.** A search that hits 3 pillars is 3 calls. pops-shell aggregates.
- **Each pillar reimplements auth, observability, error handling.** Mitigated by `@pops/types` + shared platform libs consumed by every pillar's `src/api`.
- **Local dev needs the shell to handle missing pillars gracefully.** A developer working on food alone shouldn't need finance running. `POPS_PILLARS` env var controls which pillars the resolver knows about; missing pillars return `pillar-unavailable`.
- **Contract changes need coordination.** A contract change in one pillar can break its consumers. Mitigated by the vendored-snapshot and generated-client discipline in ADR-033/ADR-040.

### What we forfeit by removing cross-pillar FKs

Inventory of cross-domain refs in the schema today + the planned cross-domain refs we're choosing to enforce by URI scheme instead of FK:

| Reference                                       | Old                                                   | New (post-pillar)                            |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `food.recipes.source_id → ingest_sources.id`    | within-pillar                                         | within-pillar (food owns both)               |
| `food.batches.location → enum`                  | within-pillar hardcoded enum                          | stays — no plan to FK to inventory locations |
| `food → lists` (`recipe-send-to-list`)          | runtime cross-pillar call (already designed this way) | stays — pops-shell calls food then lists     |
| Cerebrum engrams reference any entity           | URI scheme already                                    | URI scheme                                   |
| AI Ops `ai_inference_log.context_id`            | string-namespaced reference (already not an FK)       | stays                                        |
| Finance entities (people) used by other domains | not used today                                        | accessed via URI scheme when used            |

The audit found **zero** cross-domain FKs in the schema today that we'd lose by going to per-pillar databases. Future cross-domain links were already designed to be URI-shaped per ADR-012.

## Related ADRs

- [ADR-001](./adr-001-sqlite-source.md) — SQLite is the data store. Now: one SQLite per pillar.
- [ADR-004](./adr-004-api-domain-modules.md) — API domain modules. Superseded for backend services: domain modules become each pillar's own `src/api`.
- [ADR-005](./adr-005-shared-entities.md) — shared entities table. Superseded: no shared database or cross-pillar FKs; entities live in the `contacts` pillar.
- [ADR-012](./adr-012-universal-object-uri.md) — the URI scheme. Promoted from "convenience for cross-module references" to "the only mechanism for cross-pillar references".
- [ADR-013](./adr-013-drizzle-orm.md) — Drizzle ORM. Still applies; each pillar uses Drizzle independently with `drizzle-zod` for schema derivation.
- [ADR-014](./adr-014-trpc.md) — tRPC. Superseded here and by [ADR-033](./adr-033-cross-language-pillar-contracts.md): pillars serve ts-rest/OpenAPI, not tRPC.
- [ADR-017](./adr-017-openapi-secondary-contract.md) — OpenAPI as a secondary contract. Superseded by [ADR-033](./adr-033-cross-language-pillar-contracts.md): OpenAPI is now the primary cross-pillar contract, not a secondary one.
