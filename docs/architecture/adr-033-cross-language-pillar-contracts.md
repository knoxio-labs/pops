# ADR-033: Cross-Language Pillar Contracts via OpenAPI

## Status

Accepted — 2026-06-13

## Context

[ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) commits POPS to the "external pillar in any language drops in and works" vision. The natural-fit pillar today is TypeScript on Node — it imports `@pops/pillar-sdk`, exposes a tRPC router, gets typed consumers for free. A pillar written in Rust, Go, or Python cannot use any of that. Yet the value of the architecture is undermined if the differentiated layer (typed federation across pillars) only works for TS pillars.

The question: how does a non-TS pillar publish a typed contract that TS consumers can call, AND how does a TS pillar's contract get consumed from a non-TS pillar (e.g. a Rust pillar that wants to call `pillar('finance').transactions.list(...)`)?

Three constraints shape the answer:

1. POPS already emits an OpenAPI snapshot per pillar (per `type-generation-pipeline`, all 7 pillars). The codegen pipeline exists.
2. tRPC's wire format is JSON-over-HTTP — language-agnostic at the bytes-on-the-wire level, even though the TS consumer experience is the differentiator.
3. The audience for cross-language pillars is small and motivated. They will accept some manual codegen step in exchange for being able to ship in their preferred language.

## Options Considered

| Option                                                                                                       | Pros                                                                                                                                                                                                                                            | Cons                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Each pillar publishes its TS source, consumers import via npm**                                            | Strongest typing for TS-to-TS consumers; current state                                                                                                                                                                                          | Non-TS pillars can't author this; non-TS consumers can't consume this; locks the platform to TS                                                                 |
| **Define a custom wire-format spec + per-language SDK reference impls (Rust, Go, Python crates ship by us)** | Cleanest cross-language story; control over breaking changes                                                                                                                                                                                    | Massive maintenance burden (3+ SDK ports to keep in sync); we don't have the staffing; not POPS's job                                                           |
| **OpenAPI snapshot as the cross-language contract (chosen)**                                                 | Already shipped per `type-generation-pipeline`; every language has mature OpenAPI codegen (`openapi-typescript`, `openapi-codegen` for Rust, `openapi-python-client`, etc.); no per-language SDK to maintain; cross-repo type safety achievable | Weaker than native tRPC inference (OpenAPI loses some procedure-shape nuance); generated client is less ergonomic than typed proxy; consumers need a build step |
| **No types — runtime-validated calls via Zod or equivalent**                                                 | Lowest tooling cost; works in any language                                                                                                                                                                                                      | Loses all the differentiated value of the typed-federation story; explicitly contradicts ADR-032's stance                                                       |

## Decision

The OpenAPI snapshot is the canonical cross-language pillar contract. Every pillar publishes `openapi/<pillar>.openapi.json` as part of its contract package (already true per `type-generation-pipeline`). Cross-language consumers and producers use language-appropriate OpenAPI codegen against that snapshot.

For TS-to-TS consumption, the existing `@pops/<pillar>-contract` package with tRPC types remains the canonical path — it stays the strongest-typed surface. The OpenAPI snapshot is the fallback / external-language surface.

For cross-language pillar authoring (a Rust pillar that exposes its own router):

1. The Rust pillar authors a contract repo (`pops-finance-contract-rs` for example) that publishes the same `openapi.json` + a tRPC-compatible JSON-over-HTTP server impl.
2. The OpenAPI must conform to the same REST shape the [type-generation-pipeline](../themes/federation/prds/type-generation-pipeline.md) emits: value-direct success bodies and a `{ message, code? }` error body on real HTTP status codes, with each operation's `operationId = "<domain>.<proc>"`. The full wire conventions are documented in the [cross-language wire-format spec](../themes/federation/prds/cross-language-wire-format-spec.md).
3. The pillar registers with `POST /registry/register` (legacy alias `/core.registry.register`) advertising its baseUrl + manifest.
4. TS consumers see no difference — they call `pillar('rust-thing').something.list(...)` through the SDK proxy; the proxy treats the response identically.

No per-language SDK is maintained by the POPS project. The [cross-language wire-format spec](../themes/federation/prds/cross-language-wire-format-spec.md) is the contract the language ecosystem implements against using whatever OpenAPI tooling already exists in that language. The Rust `contacts` pillar is the live proof it is implementable.

## Consequences

- **Enables:** language-agnostic pillar authoring — shipped. The [wire-format spec](../themes/federation/prds/cross-language-wire-format-spec.md) documents the contract and the Rust `contacts` pillar federates live against it.
- **Enables:** the OpenAPI snapshot becomes the public contract surface even for TS consumers in external repos that don't want to npm-install the contract package.
- **Prevents:** language-specific SDK ports owned by POPS. Anyone wanting an idiomatic Rust SDK builds it themselves on top of the OpenAPI spec.
- **Constrains:** the wire format must remain stable. Breaking changes to the success/error envelope, status-code mapping, or registry handshake become breaking for every cross-language consumer simultaneously. Versioning becomes a hard contract semver (per ADR-030).
- **Trade-off accepted:** non-TS consumers get a weaker typing experience (OpenAPI-generated types are coarser than the in-tree TS contract's inference). They get language idiomaticity in exchange. This is the right trade for the audience.
- **Trade-off accepted:** the wire-format spec is a load-bearing artifact. It is the source of truth for cross-language interop, more so than any single TS implementation.

## Amendment — 2026-08-15: a vendored snapshot rots against its producer, and the branch that pays is not the one that caused it

A consumer that vendors a producer's snapshot (`scripts/ci/check-vendored-contracts.mjs` for which legs exist and why) owes a re-vendor every time that producer's contract changes. This amendment records where that obligation is enforced, where it is not, and which half of the gap is being closed.

### What the drift gate already covers, and it is more than it was credited with

A producer PR that changes `pillars/<id>/openapi/**` while a consumer's vendored copy exists **in that branch's tree** fails on the producer's own branch, at PR time, before the queue. That was verified by construction rather than assumed: editing `pillars/purchases/openapi/purchases.openapi.json` on a clean tree makes `check-vendored-contracts.mjs` report `drifted from … — re-vendor and regenerate the client` and exit 1. The in-tree half of "the producer must bring its consumers along" is therefore not a gap and needs no new mechanism.

### What it cannot cover, which is the case that actually evicted a PR

Nothing tree-local can see a consumer that is not in the tree. PR #4092 was the PR **adding** the `finance/app` -> `purchases` leg; while it sat in the merge queue, #4085 merged a purchases contract change. #4085's branch had no finance copy to drift against, so it was correctly green; #4092 was correctly green against the base it was tested on; the merged result was inconsistent, and the queue evicted #4092 with four red checks over work that had nothing to do with the contract. It had already been re-vendored once that session for the same reason.

That shape — a leg being added, or a contract changing, on a branch the other side cannot see — is a semantic merge conflict that git resolves cleanly because the two sides touch different files. Closing it needs the set of open pull requests, not the filesystem.

### Decision

1. **A producer-side signal, implemented** — `scripts/ci/report-contract-consumers.mjs`, run by `quality.yml` → `contract-consumers`. On a change to `pillars/*/openapi/**` it names every vendored consumer that must follow, with the `cp` and the regenerate command for each, derived from the consumer's own declaration rather than a list to keep in sync. It reports; it does not gate. The obligation it names may be owed to a pull request that has not merged, and blocking the producer until it does would deadlock the pair.
2. **The residual is accepted, not solved.** A vendored leg's holder re-vendors immediately before enqueueing, and a queue eviction from a producer that merged mid-flight is an expected cost of vendoring — not a defect in the evicted PR and not a reason to re-review it. Re-vendor, re-enqueue.
3. **Automated re-vendor PRs (the Dependabot shape) are declined for now.** They would close the residual properly, and they are a bigger change than the exposure justifies while three legs exist and a leg is bootstrapped roughly once per consumer. The trigger to revisit is the leg count growing or the same eviction recurring after the signal is in place.

### The `ALLGREEN` blast radius

The merge queue groups entries and an eviction takes the whole group with it, so one stale snapshot can eject PRs that never touched a contract. That is accepted as it stands. The alternative — grouping of one — would multiply queue time by the entry count, and a merge-group run cannot be path-filtered (`.github/workflows/quality.yml` header), so every entry already pays the full pipeline including the ~29-minute iOS leg. Paying that per PR to contain a failure mode that has fired twice is the worse trade. What makes it tolerable is that the eviction is recoverable and the evicted PR is not wrong; what would change it is evictions arriving faster than the queue drains.

## Related

- [ADR-030](adr-030-contract-packages-semver.md) — contract package semver discipline becomes load-bearing here
- [ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) — establishes the external-pillar vision this ADR enables
- [type-generation-pipeline](../themes/federation/prds/type-generation-pipeline.md) — codegen pipeline emits the OpenAPI snapshot this ADR depends on (shipped fleet-wide)
- [Cross-language wire-format spec](../themes/federation/prds/cross-language-wire-format-spec.md) — the REST wire contract a non-TS pillar implements
- [external-pillar-example-repo](../themes/federation/prds/external-pillar-example-repo.md) — external Rust pillar example (in progress); the in-tree `contacts` pillar already proves cross-language federation
