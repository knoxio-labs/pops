# ADR-040: Cross-Pillar Contract Discipline

## Status

Accepted — 2026-07-06

## Context

The pillar-isolation coupling audit ([ADR-039](adr-039-pillar-isolation.md)) flagged three related gaps in how pillars consume each other's contracts:

- **Per-consumer generated FE clients are a second, mostly-ungated cross-pillar coupling in the frontend.** `food/app` consumes `lists`, `finance/app` consumes `contacts` — each via its own generated Hey API client, parallel to (and separate from) the backend `@pops/pillar-sdk` path. Nothing regenerated and diffed these clients on every change to the producer's contract, so a producer-side edit could ship without every consumer's committed client following. This gap was live: `pillars/ai/app` carried a third such leg (`finance-api`, feeding a cache-management admin page) that had already drifted — a finance hygiene pass (#3724) deleted the three endpoints the page called, but never touched `ai/app`'s generated client or the page itself, leaving a live nav item that 404s.
- **Two Rust wire-contract "twins" are hand-duplicated, pinned only by a fixture test.** `libs/pops-settings` and `libs/pops-ai` hand-author Rust structs mirroring the TS `@pops/pillar-settings` and `@pops/ai-telemetry` zod schemas, kept honest by a cross-language golden-fixture round-trip test (`tests/contract.rs` on the Rust side, a sibling fixture test on the TS side) rather than by codegen from one source. Neither crate has a Rust consumer today — `contacts`, the only Rust pillar, depends on neither.
- **`ai-api`'s `/ai-usage/record` is an undeclared integration point.** It is the single telemetry ingest endpoint for finance, food, and cerebrum's AI calls (and, via `libs/pops-ai`'s `EnvHttpSink`, any future Rust caller), on the runtime path of all three but never declared a stable, versioned contract subject to the deprecation discipline other cross-pillar contracts already follow.

## Decision

### 1. Per-consumer generated FE clients are sanctioned — every leg carries a regenerate-and-diff CI gate

Two cross-pillar call surfaces coexist by design:

| Surface                         | Mechanism                                                                                                                                                                                                                  | Live examples                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Backend-to-backend              | `@pops/pillar-sdk` `pillar('<id>')` proxy (`libs/sdk`)                                                                                                                                                                     | finance -> contacts (entity reads), ai -> cerebrum (nudge dispatch), finance -> registry (user lookup) |
| Browser-to-pillar, cross-domain | a per-consumer generated Hey API client (`@hey-api/openapi-ts` against the producer's `./openapi` package export, or a vendored snapshot for a non-npm producer per [ADR-033](adr-033-cross-language-pillar-contracts.md)) | food/app -> lists (send-to-list), finance/app -> contacts (entity picker)                              |

A per-consumer client is legitimate only when its leg is CI-gated: CI re-runs the owning app's `generate:*-client` script and fails the build on any diff between what codegen produces and what's committed, so a producer contract change the consumer's client doesn't yet reflect is caught pre-merge, not discovered at runtime. The `finance/app` -> `contacts` leg was already half-covered by the vendored-snapshot drift check (`scripts/ci/check-vendored-contracts.mjs`, ADR-033) — that check only proves the vendored JSON matches its canonical source, not that the generated TS client was regenerated from it. This ADR closes that gap and extends the same regenerate-and-diff guarantee to `food/app` -> `lists`, via the `cross-pillar-clients` CI job.

`ai/app` -> `finance` is retired rather than gated: its only consumer, the cache-management admin page, called finance endpoints deleted as dead code (#3724) with no corresponding regeneration of `ai/app`'s client — exactly the failure mode this ADR closes. With the endpoints gone the leg has zero live purpose, so the client, its page, and its route are deleted instead of resurrected. Any future browser-facing cross-pillar read follows the pattern above: a per-consumer client plus a leg in the `cross-pillar-clients` CI job.

### 2. Rust wire-contract twins: hand-duplication is an accepted interim, not the target state

Hand-authoring `libs/pops-settings` / `libs/pops-ai`'s Rust structs and pinning them to the TS shape with a golden-fixture round-trip test is acceptable while neither crate has a Rust consumer — there is no compiler to fail on drift, so a fixture test is the strongest guard available, and building codegen for zero consumers is waste.

Once a Rust pillar depends on either crate, hand-duplication stops being acceptable. Generate the Rust structs from the same schema source the TS side derives from — e.g. project the zod schema to JSON Schema and run a Rust codegen (such as `typify`) over it, or fold both contracts into the existing OpenAPI-snapshot pipeline per ADR-033 — so a TS contract change fails Rust **compilation**, not a fixture test someone forgot to update. This ADR records the trigger (first real Rust consumer of either crate) and the target shape; it does not implement the codegen now, since there is nothing to generate against yet.

### 3. `/ai-usage/record` is a stable, versioned telemetry contract

`ai-api`'s `POST /ai-usage/record` is the sole ingest point for every pillar's AI-call telemetry — finance's categorizer, food's recipe/vision prompts, cerebrum's ego chat, and, via `libs/pops-ai`'s `EnvHttpSink`, any future Rust caller. It already degrades safely (a no-op sink when unset or unreachable) but was never declared a versioned surface.

From this ADR, `/ai-usage/record`'s request shape (`InferenceRecordSchema` in `@pops/ai-telemetry`) is a stable contract. Additive changes (a new optional field) ship freely. Anything else — renaming or removing a field, changing the status enum, tightening a previously-optional field — is a breaking change and goes through the same deprecation discipline [ADR-026](adr-026-pillar-architecture.md) already calls for on cross-pillar contracts: dual-accept the old and new shape for a deprecation window, update every emitter (TS callers plus the `pops-ai` Rust crate and its golden fixture), then remove the old shape.

## Amendment — 2026-08-10: bare `fetch` is a third surface, and it is not sanctioned

The table above names two cross-pillar call surfaces. A third existed in the tree and was never decided on: two backends resolved a sibling's base URL out of `POPS_PILLARS` and called it with `globalThis.fetch` — `food` → `lists` (send-to-list) and `cerebrum` → `finance`/`media`/`inventory` (retrieval enrichment and the cross-source embedding scan).

**Both are migrated onto the SDK proxy, and the pattern is refused rather than sanctioned.** It carries none of the properties either sanctioned surface has: no `operationId` to pin, so the backend expectation guard cannot cover it; no generated client to diff, so the frontend gate does not apply either. The two seams were also already broken in production and nothing said so — [ADR-039](adr-039-pillar-isolation.md) E25 stopped plumbing `POPS_PILLARS` through production compose when the registry became the source of truth, which left `resolveListsBaseUrl()` throwing on every send-to-list request and every cerebrum peer client resolving to `undefined`. A seam that no guard watches is a seam that can be dead for a release cycle without a failing check.

Refusing a pattern only works if something notices its return. `scripts/ci/check-cross-pillar-expectations.mjs` therefore grows a third enumeration alongside its `pillar(...)` coverage half: a file under `pillars/*/src` that speaks the federation — parses the fleet's pillar base-URL format, handles registry entries, or reads the pillar roster — and calls `fetch` itself is reported unless it appears in `SANCTIONED_DIRECT_FETCH` with a reason. Three entries qualify today, all runtime dispatchers no `operationId` could pin either way: the registry's `/uri/resolve` dispatch and `/health` fan-out, and the shell's same-origin boot fetches.

The detector's limit is worth stating rather than discovering later: it keys on knowing about _other pillars_, not on calling HTTP. A hand-rolled call that gets its target from a bespoke env var or a hardcoded container host carries none of those signals and is not caught. That bound is deliberate — the alternative signal ("this file calls `fetch`") would report every TMDB, Plex and Ollama client in the tree and buy a sanction entry per external integration, which is how an exemption list stops being read.

## Amendment — 2026-08-13: a live npm package is not sufficient reason to depend on it

The table's "or a vendored snapshot for a non-npm producer per ADR-033" framing assumed vendoring is only forced by a missing npm package. `finance/app` -> `purchases` showed that framing incomplete: `@pops/purchases` has a real package, so `require.resolve('@pops/purchases/openapi')` worked and was the mechanism this leg shipped with — but declaring `@pops/purchases: workspace:*` as a devDependency of `app-finance` makes pnpm treat the purchases **backend** as part of `app-finance`'s dependency closure, not just its `./openapi` export. Two places paid for that: `pillars/shell/Dockerfile`'s `--filter "@pops/shell..."` install had to resolve and build `better-sqlite3`, `express`, `drizzle-orm`, and `@anthropic-ai/sdk` to produce a shell image that imports none of them, and `app-quality.yml`'s `--filter "@pops/app-finance^..." build` compiled the entire purchases pillar to build a frontend that only reads a static JSON file.

`finance/app` -> `purchases` now vendors its snapshot under the same ADR-033 mechanism `contacts` uses, kept honest by the same `scripts/ci/check-vendored-contracts.mjs` drift guard. The decision rule going forward: vendor whenever a producer is same-workspace but TS-pillar-shaped — package.json `dependencies` that are the producer's own runtime, not shared contract-only code — even though a live package dependency would technically resolve. A future per-pillar contract-only sub-package (exporting just the spec and generated types, no runtime deps) would let such legs go back to a live dependency without paying this cost; this amendment does not implement that, it only records that the missing-npm-package case is not the only one vendoring exists for. `food/app` -> `lists` has the identical shape and has not been converted — tracked separately so this amendment doesn't silently claim it as fixed.

## Consequences

- Every browser-facing cross-pillar generated client either regenerates clean in CI or fails the build — a producer contract edit can no longer ship without its consumer(s) noticing.
- One dead cross-pillar leg (`ai/app` -> `finance`) and the broken admin page it fed are removed instead of carried forward as an ungated liability.
- The Rust-twin gap is accepted as-is until it has a real cost (a Rust consumer); the codegen target is written down so it isn't relitigated from scratch when that day comes.
- `/ai-usage/record` changes now have an explicit discipline to follow instead of an implicit "just don't break it."

## Related

- [ADR-026](adr-026-pillar-architecture.md) — pillar architecture; the deprecation-cycle discipline this ADR borrows for `/ai-usage/record`
- [ADR-033](adr-033-cross-language-pillar-contracts.md) — cross-language pillar contracts; governs the `contacts` vendored-snapshot leg and is the template for a future Rust-twin codegen path
- [ADR-039](adr-039-pillar-isolation.md) — pillar isolation; the coupling audit this ADR resolves three findings from
