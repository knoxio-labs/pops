# Epic: Plex Sync

**Theme:** Media
**Priority:** 6 (can run in parallel with Epic 7 after Epic 3)
**Status:** Not started

## Goal

Sync the Plex library and watch history into POPS so that watched status is tracked automatically. If you watch a movie on Plex, POPS knows — no manual input required.

## Scope

### In scope

- **Plex API client service:**
  - Authenticate with Plex server (token-based, via environment variable / Docker secret)
  - Discover Plex libraries (movie and TV libraries)
  - Fetch library contents (all movies and shows in a library)
  - Fetch watch history (watched status per item, last viewed date)
- **Initial library import:**
  - Scan Plex movie library → match to TMDB by title/year or Plex's TMDB agent ID
  - Scan Plex TV library → match to TheTVDB by title/year or Plex's TheTVDB agent ID
  - For matched items not already in the local library, auto-add via the metadata integration (Epic 1's "add to library" flow)
  - For items already in the library, link Plex ID to existing record
  - Report on unmatched items for manual review
- **Watch history sync:**
  - For each item in the Plex library, check if Plex reports it as watched
  - If watched on Plex but not in POPS → create watch_history entry (use Plex's "last viewed at" timestamp)
  - If watched in POPS but not on Plex → no action (POPS is the source of truth for manual watches)
  - TV shows: sync at episode level — check each episode's watched status
- **Polling-based sync:**
  - Scheduled sync job (configurable interval, default every 6 hours)
  - Manual "sync now" button in the UI
  - Sync log — record last sync time, items added, items updated, errors
- **Plex connection settings:**
  - Configuration page or section for Plex server URL and token
  - Connection test ("can we reach your Plex server?")
  - Library selection (which Plex libraries to sync — user may have multiple)
- **Sync status UI:**
  - Last sync timestamp displayed somewhere visible
  - Sync-in-progress indicator
  - Sync results summary (added X movies, updated Y watch statuses, Z errors)

### Out of scope

- Plex webhooks (future enhancement — polling first for simplicity)
- Writing back to Plex (POPS reads from Plex, never writes to it)
- Syncing Plex ratings (POPS has its own comparison-based rating system)
- Plex playlist sync
- Syncing non-movie/TV content (music, photos)
- Plex user management (single-user system)

## Deliverables

1. Plex API client service with authentication and library/history fetch
2. Matching logic for Plex items — TMDB for movies, TheTVDB for TV (by agent ID, then title/year fallback)
3. Initial library import flow (scan Plex → match TMDB → add to POPS)
4. Watch history sync (Plex watched → POPS watch_history entries)
5. Episode-level TV sync
6. Polling scheduler with configurable interval
7. Manual "sync now" trigger via tRPC
8. Sync log with last run time, counts, and errors
9. Plex connection configuration UI (server URL, token, library selection)
10. Connection test endpoint
11. Unit tests for metadata matching logic (TMDB + TheTVDB)
12. Integration test for the sync flow (mocked Plex API responses)
13. `mise db:seed` updated with Plex sync state — last sync timestamp, a mix of Plex-sourced and manually-added library items

## Dependencies

- Epic 0 (Data Model) — tables to write into
- Epic 1 (Metadata Integration) — "add to library" flow for new items
- Epic 3 (Tracking & Watchlist) — watch_history table and tracking logic

## Risks

- **Plex API instability** — Plex's API is semi-official. Endpoints change, authentication evolves. Mitigation: isolate behind a service interface. If Plex breaks, the rest of the media app still works — you just lose auto-sync.
- **Metadata matching accuracy** — Matching Plex items to TMDB/TheTVDB by title + year is imperfect (remakes, regional titles, special characters). Mitigation: prefer Plex's agent IDs when available (most Plex libraries use TMDB for movies and TheTVDB for TV). Fall back to title/year search. Log unmatched items for manual resolution.
- **Large library initial import** — A Plex library with 2,500 movies requires 2,500 TMDB lookups on first sync. At TMDB's 40 req/10s limit, that's ~10 minutes. Mitigation: queue with progress indicator. This is a one-time cost — subsequent syncs only process new/changed items.
- **Duplicate detection** — If a movie was manually added to POPS and also exists in Plex, the sync must recognise it as the same item (match on TMDB ID for movies, TheTVDB ID for TV). Mitigation: external IDs are the canonical identifiers. Always check for existing records before inserting.
