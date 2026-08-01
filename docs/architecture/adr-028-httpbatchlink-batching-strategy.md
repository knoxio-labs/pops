# ADR-028: `httpBatchLink` batching strategy

## Status

**Superseded** by [ADR-026](./adr-026-pillar-architecture.md) — 2026-08-01. Never implemented; it was still `Proposed` when the layer it applied to was removed.

## What it decided

That the shell's tRPC client would use `splitLink` to give each pillar its own `httpBatchLink`, so `finance.*` and `media.*` batched separately and no cross-pillar batch could form — the blocker that was keeping the monolith's legacy tRPC mounts alive.

## Why it no longer holds

There is no tRPC client and no monolith. Each pillar's frontend consumes its own pillar over a generated REST client, so a batch spanning two pillars is not a thing that can exist.

Stubbed deliberately: the full options table is in git history.
