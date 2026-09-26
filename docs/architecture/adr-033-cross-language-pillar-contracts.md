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
- **Constrains:** the wire format must remain stable. Breaking changes to the success/error envelope, status-code mapping, or registry handshake become breaking for every cross-language consumer simultaneously.
- **Trade-off accepted:** non-TS consumers get a weaker typing experience (OpenAPI-generated types are coarser than the in-tree TS contract's inference). They get language idiomaticity in exchange. This is the right trade for the audience.
- **Trade-off accepted:** the wire-format spec is a load-bearing artifact. It is the source of truth for cross-language interop, more so than any single TS implementation.

## Amendment — 2026-08-15: a vendored snapshot rots against its producer

A consumer that vendors a producer's snapshot (`scripts/ci/check-vendored-contracts.mjs`) owes a re-vendor every time that producer's contract changes. In-tree drift is caught at PR time by that guard. A change on a branch the tree can't see — a consumer leg and a producer contract change landing in the same merge-queue window (PR #4092/#4085) — is not, since it's a semantic conflict git resolves cleanly.

1. **A producer-side signal, implemented** — `scripts/ci/report-contract-consumers.mjs`, run by `quality.yml` → `contract-consumers`, names every vendored consumer that must follow a `pillars/*/openapi/**` change. It reports; it does not gate, since the obligation may be owed to a PR that hasn't merged yet.
2. **The residual is accepted, not solved.** A queue eviction from a producer that merged mid-flight is an expected cost of vendoring, not a defect in the evicted PR. Re-vendor, re-enqueue.
3. **Automated re-vendor PRs (the Dependabot shape) are declined for now** — a bigger change than the exposure justifies while three legs exist. Revisit if the leg count grows or the eviction recurs.

## Related

- [ADR-030](adr-030-contract-packages-semver.md) — contract packages and semver discipline; superseded by this ADR and ADR-040
- [ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) — establishes the external-pillar vision this ADR enables
- [type-generation-pipeline](../themes/federation/prds/type-generation-pipeline.md) — codegen pipeline emits the OpenAPI snapshot this ADR depends on (shipped fleet-wide)
- [Cross-language wire-format spec](../themes/federation/prds/cross-language-wire-format-spec.md) — the REST wire contract a non-TS pillar implements
- [external-pillar-example-repo](../themes/federation/prds/external-pillar-example-repo.md) — external Rust pillar example (in progress); the in-tree `contacts` pillar already proves cross-language federation
