# ADR-014: tRPC Over REST or GraphQL

## Status

**Superseded** by [ADR-026](./adr-026-pillar-architecture.md) and [ADR-033](./adr-033-cross-language-pillar-contracts.md) — 2026-08-01.

## What it decided

tRPC for the API layer, over REST and GraphQL. The reasoning was that its client/server coupling did not matter for one TypeScript frontend talking to one TypeScript backend in one monorepo, and that end-to-end type inference with no schema or codegen step was worth more than a language-neutral contract.

## Why it no longer holds

Both premises were retired. The single backend became a federation of independently deployable pillars (ADR-026), and one of them — `contacts` — is written in Rust (ADR-033), so the wire format had to be something a non-TypeScript service could serve. POPS now runs zod → ts-rest → OpenAPI per pillar. There is no tRPC anywhere in the tree.

Stubbed deliberately: the full options table and rationale are in git history. Left inline, it read as a current description of an API layer the code has not had for months.
