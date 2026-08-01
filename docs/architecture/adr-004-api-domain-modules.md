# ADR-004: API as Domain Modules in One Server

## Status

**Superseded** by [ADR-026](./adr-026-pillar-architecture.md) — 2026-06-09.

## What it decided

One server with domain-grouped tRPC routers over a single shared database, keeping domains isolated by convention rather than by process.

## Why it no longer holds

The convention did not hold: the pattern accumulated three different answers to "where do backend services live" across food, finance and lists. ADR-026 replaced it with real isolation — each pillar owns its database, container and contract. The single server it describes has been deleted.

Stubbed deliberately: the full options table is in git history. Its original status note also said the pattern "continues to apply until each domain migrates", which stopped being true once the monolith was removed.
