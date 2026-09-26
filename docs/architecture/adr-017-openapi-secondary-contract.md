# ADR-017: OpenAPI as Secondary API Contract

## Status

**Superseded** by [ADR-033](./adr-033-cross-language-pillar-contracts.md) — 2026-09-26.

## What it decided

`trpc-openapi` as a bolt-on to tRPC: annotate procedures with `.meta()` to generate an OpenAPI 3.1 spec from live router definitions, as a secondary contract for non-TypeScript consumers while tRPC stayed primary for the frontend.

## Why it no longer holds

There is no tRPC anywhere in the tree (see [ADR-014](./adr-014-trpc.md)), so there is no router to bolt OpenAPI onto. OpenAPI is now each pillar's one and only contract, not a secondary layer: TypeScript pillars project it from zod → ts-rest, and the Rust `contacts` pillar emits it from utoipa (ADR-033).

Stubbed deliberately: the full options table and rationale are in git history.
