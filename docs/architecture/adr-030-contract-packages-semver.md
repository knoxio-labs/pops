# ADR-030: Contract packages and semver discipline

## Status

**Superseded** by [ADR-033](./adr-033-cross-language-pillar-contracts.md) and [ADR-040](./adr-040-cross-pillar-contract-discipline.md) — 2026-09-26. Still `Proposed` when superseded: the semver CI job was never built.

## What it decided

Standalone `@pops/contract-<pillar>` packages (types + Zod only, no runtime code), with a CI job diffing each package's public surface against `main` and enforcing semver discipline on breaking changes.

## Why it no longer holds

Seven separate `@pops/<pillar>-contract` packages were scaffolded and later folded back into their pillars (#3465); each TypeScript pillar's contract now lives in its own package under `src/contract/`, and no semver surface-diff job exists. Cross-pillar contract enforcement instead ships as: the `@pops/pillar-sdk` proxy for backend-to-backend calls, generated OpenAPI/Hey-API clients with regenerate-and-diff CI gates for browser-to-pillar, and vendored-snapshot drift checks (`scripts/ci/check-vendored-contracts.mjs`) for cross-language consumers, per ADR-033 and ADR-040.

Stubbed deliberately: the full options table and rationale are in git history.
