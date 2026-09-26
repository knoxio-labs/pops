# ADR-050: Finance logo assets live in a `logo_blobs` table in finance's own SQLite

## Status

**Superseded** by `pillars/finance/migrations/0100_drop_institutions.sql` (POPS-3064) — 2026-09-26.

## What it decided

A `logo_blobs` table inside `finance.db`, storing institution logo bytes as a `BLOB` column rather than on the filesystem, so litestream's existing whole-file replication of `finance.db` covered backup for free.

## Why it no longer holds

The institution→entity consolidation (POPS-3064) dropped both `institutions` and `logo_blobs` from finance; nothing there resolves `institutions.logo_asset_id` any more, and `src/api/modules/logo-upload.ts` is gone. The pattern this ADR set — small image assets as a `BLOB` column in a pillar's own SQLite file, riding that pillar's existing litestream replication instead of a filesystem tree with no generic backup story — is still live precedent: `pillars/contacts` cites it for the same call on entity avatars/posters (`pillars/contacts/migrations/0005_blobs.sql`).

Stubbed deliberately: the full options table and rationale are in git history.
