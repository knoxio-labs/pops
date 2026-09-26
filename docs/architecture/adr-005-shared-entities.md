# ADR-005: Entities as a Platform-Level Concept

## Status

**Superseded** by [ADR-026](./adr-026-pillar-architecture.md) — 2026-09-26.

## What it decided

Entities (merchants, companies, people, brands) as a platform-level concept: a shared `entities` table in a `core/` module, referenced by every domain via foreign keys.

## Why it no longer holds

Pillars have no shared database and no cross-pillar foreign keys (ADR-026), so a table referenced by FK from every domain is structurally impossible now. Entities live in the standalone `contacts` pillar (`pillars/contacts`) and are referenced by id over HTTP/contract, not FK. No ADR records that specific move to `contacts` yet (POPS-4894).

Stubbed deliberately: the full options table and rationale are in git history.
