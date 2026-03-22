# Epic: Plex Sync

**Theme:** Media
**Priority:** 6
**Status:** In Progress

## Goal

Sync the Plex library and watch history into POPS so that watched status is tracked automatically. Authentication and server configuration must be handled through a user-friendly, dynamic setup process within the application.

## Scope

### In scope

- **Dynamic Authentication Flow:**
  - Implement Plex PIN-based authentication (OAuth-like).
  - Store authentication tokens securely in the database `settings` table.
  - Automate the sign-in redirect and polling process.
- **UI-Driven Configuration:**
  - Provide a settings interface for entering and validating the Plex Server URL.
  - Classify server address and user tokens as **Settings** (DB), not **Secrets** (ENV).
- **Library & History Sync:**
  - Discover and select Plex libraries via the UI.
  - Initial import of movie and TV show metadata.
  - Continuous sync of watch history at the episode level.
- **Robust Connection Management:**
  - Real-time connection health monitoring.
  - Explicit error reporting for unreachable servers or expired tokens.

### Out of scope

- Webhooks (v1 uses polling only).
- Non-video content (music, photos).
- Multi-user support.

## Deliverables

1. **Plex PIN Authentication Service:** Dynamic token acquisition and database persistence.
2. **Server Configuration UI:** Integrated URL entry with mandatory reachability validation.
3. **Plex API Client:** Dynamic client factory that retrieves credentials from database.
4. **Metadata Matching Logic:** Extraction of TMDB/TheTVDB IDs from Plex library data.
5. **Initial Sync Engine:** Background importer for libraries and watch history.
6. **Polling Scheduler:** Periodic synchronization of new activity.
7. **Sync Status Dashboard:** Visual feedback on connection health and sync results.

## Dependencies

- [Epic 04: DB Schema Patterns](../../foundation/epics/04-db-schema-patterns.md) — Shared `settings` table.
- [Epic 01: Metadata Integration](../01-metadata-integration.md) — TMDB/TheTVDB clients.

## Risks

- **Authentication Timeout:** User might not complete the Plex sign-in within the PIN window. *Mitigation:* Clear instructions and easy "Retry" button.
- **Address Changes:** Home servers often have dynamic IPs. *Mitigation:* Explicit "Missing URL" status and easy UI-based updates.
