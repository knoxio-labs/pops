# pops-ai

> **This crate is a hand-copied twin of `libs/ai-telemetry` (`@pops/ai-telemetry`), and nothing keeps the two in sync.**
> It re-implements that package's `InferenceRecord` wire shape and reporting behaviour in Rust by hand. There is no codegen from either side. The serde attributes are the contract — see `src/record.rs`'s header. Change the TypeScript schema without replaying it here and the two languages POST different bodies to the same ingest — with **CI green on both**.

The Rust half of cross-pillar AI telemetry, so a Rust pillar can report to the `ai` pillar's `POST /ai-usage/record` on the same wire every TypeScript pillar uses. `src/lib.rs` lists the exported surface.

## Who depends on it

**Nobody.** No crate in the cargo workspace depends on `pops-ai`, and `pillars/contacts` — the only Rust pillar — makes no model calls. The crate is a workspace member, so `rust-quality.yml` compiles, clippies and tests it, but no deployed binary links it.

That means no record produced by this crate has ever reached the real ingest — the only evidence of wire compatibility is the fixture test below.

## Why drift is silent

`tests/contract.rs` and the TypeScript `record-fixture.test.ts` each describe themselves as pinning a _shared_ golden fixture. They do not share a file:

- `libs/pops-ai/tests/fixtures/record.json`
- `libs/ai-telemetry/src/__tests__/fixtures/record.json`

Two files, byte-identical today, with no CI step comparing them. The Rust test round-trips its own copy byte-for-byte; the TypeScript test parses its own copy. Edit the Rust struct and the Rust fixture together and this suite passes while the TypeScript suite — untouched — also passes. **When you change the record shape, edit both fixtures and diff them.**

## Constraints

- **A lib crate may never depend on a pillar crate** (`scripts/extractability/check-cargo-deps.mjs`, run by `rust-quality.yml`).
- The record shape is a stable cross-pillar contract under [ADR-040](../../docs/architecture/adr-040-cross-pillar-contract-discipline.md): additive changes ship freely, anything else needs a dual-accept deprecation window across every emitter in both languages.

## What a first consumer will hit

- **`call_with_logging` requires a tokio runtime.** The off-hot-path report is a `tokio::spawn`, not a detached future — calling it outside a runtime panics. The TypeScript original has no equivalent requirement.
- **`call_with_logging` requires the wrapped call to return `anyhow::Result<CallResult<T>>`** (`src/call.rs`), where the TypeScript wrapper accepts any thrown value.
- **`EnvHttpSink` is a silent no-op with no base URL**, and its env resolution has already drifted from the TypeScript sink in two ways. It reads the environment once, in `from_env`, where TypeScript re-reads `process.env` on every call. And it treats an empty string as unset, so `AI_API_URL=""` falls through to `POPS_API_URL` and reports there; TypeScript's `??` keeps the empty string and no-ops instead. Since every pillar's `POPS_API_URL` points at itself, that difference turns an intended no-op into a self-POST. Treat this as a worked example of what an unpinned twin costs, not as settled behaviour.
- **Token counts are `u32` and cost is `f64`.** The TypeScript schema constrains them to non-negative integers and a finite non-negative float; a value that overflows `u32` is representable on the wire and will fail to deserialize here.
