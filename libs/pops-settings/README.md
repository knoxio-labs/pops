# pops-settings

> **This crate is a hand-copied twin of `libs/settings` (`@pops/pillar-settings`), and nothing keeps the two in sync.**
> It re-implements that package's federated `/settings/*` wire contract in Rust — wire structs, RU+reset service, redaction sentinel, manifest derivation — by hand. There is no codegen from either side. A change to the TypeScript contract that is not manually replayed here produces two languages serving two different wires, and **CI stays green on both**.

`src/lib.rs`'s header describes the surface and the protocol.

It carries two things the TypeScript package does not: an axum router (`src/routes.rs`), and a utoipa OpenAPI document pinned to 3.0.3 with dot-form `settings.*` operationIds (`src/openapi.rs`).

## Who depends on it

**Nobody.** No crate in the cargo workspace depends on `pops-settings`, and `pillars/contacts` — the only Rust pillar — does not use it (its manifest declares an empty settings set). The crate is a workspace member, so `rust-quality.yml` compiles, clippies and tests it, but no deployed binary links it.

That also means the twin has never been exercised against a real database or a real identity gate.

## Why drift is silent

`tests/contract.rs` and the TypeScript `contract-fixture.test.ts` each describe themselves as validating a _shared_ golden fixture. They do not share a file:

- `libs/pops-settings/tests/fixtures/settings.json`
- `libs/settings/src/__tests__/settings.fixture.json`

**When you change a wire shape, edit both fixtures and diff them.**

## Constraints

- **A lib crate may never depend on a pillar crate** (`scripts/extractability/check-cargo-deps.mjs`, run by `rust-quality.yml`).
- Do not swap a `BTreeMap` output for a `HashMap` — the deterministic sorted key order is what makes a byte comparison against the TypeScript side meaningful (`src/wire.rs`).
