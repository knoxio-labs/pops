# PRD-016: Radarr & Sonarr

**Epic:** [07 — Radarr & Sonarr](../themes/media/epics/07-radarr-sonarr.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md)

## Problem Statement

The user uses Radarr (movies) and Sonarr (TV shows) to manage media acquisition. Without integration, the user has to switch between POPS and the Radarr/Sonarr web UIs to check download status. Surfacing this status within POPS — on the media detail pages — provides a unified view of each title's lifecycle: watchlist → downloading → available → watched.

## Goal

Read-only status badges on movie and TV show detail pages showing Radarr/Sonarr monitoring and download status. Connection configuration for both services. Lightweight — no management UI in v1.

## Requirements

### R1: Arr API Client

Both Radarr and Sonarr share the *arr stack API pattern. Build a shared base client with service-specific extensions:

```
media/arr/
  base-client.ts      (shared HTTP client for *arr APIs)
  radarr-client.ts    (Radarr-specific endpoints)
  sonarr-client.ts    (Sonarr-specific endpoints)
  types.ts            (shared + service-specific response types)
  service.ts          (orchestration — status lookup, caching)
  service.test.ts
  base-client.test.ts
```

**Shared *arr API pattern:**
- Base URL: user-configured
- Authentication: `X-Api-Key` header
- JSON responses
- Similar endpoint structures for both services

### R2: Radarr Client

**Key endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v3/system/status` | GET | Connection test |
| `/api/v3/movie` | GET | All monitored movies |
| `/api/v3/movie/{id}` | GET | Single movie detail |
| `/api/v3/queue` | GET | Download queue |

**Movie status mapping:**

| Radarr field | POPS display |
|-------------|-------------|
| `monitored: true`, `hasFile: true` | "Available" (downloaded) |
| `monitored: true`, `hasFile: false` | "Monitored" (wanted, not downloaded) |
| `monitored: false` | "Unmonitored" |
| In download queue | "Downloading X%" |

**Matching:** Radarr uses TMDB IDs natively (`tmdbId` field on each movie). Direct lookup against `movies.tmdb_id` in the POPS database.

### R3: Sonarr Client

**Key endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v3/system/status` | GET | Connection test |
| `/api/v3/series` | GET | All monitored series |
| `/api/v3/series/{id}` | GET | Single series detail |
| `/api/v3/queue` | GET | Download queue |

**Series status mapping:**

| Sonarr field | POPS display |
|-------------|-------------|
| `monitored: true`, all episodes have files | "Complete" |
| `monitored: true`, some episodes have files | "Partial (X/Y episodes)" |
| `monitored: true`, no files | "Monitored" |
| `monitored: false` | "Unmonitored" |
| In download queue | "Downloading — [episode name]" |

**Matching:** Sonarr uses TheTVDB IDs natively (`tvdbId` field on each series). Direct lookup against `tv_shows.tvdb_id` in the POPS database.

### R4: Connection Configuration

**Environment variables (v1):**
- `RADARR_URL` — Radarr server base URL (e.g., `http://192.168.1.100:7878`)
- `RADARR_API_KEY` — Radarr API key
- `SONARR_URL` — Sonarr server base URL (e.g., `http://192.168.1.100:8989`)
- `SONARR_API_KEY` — Sonarr API key
- All optional — either, both, or neither can be configured

**tRPC procedures:**

| Procedure | Type | Description |
|-----------|------|-------------|
| `media.arr.testRadarr` | query | Test Radarr connection, return server version |
| `media.arr.testSonarr` | query | Test Sonarr connection, return server version |
| `media.arr.getConfig` | query | Return which services are configured and reachable |

### R5: Status Badges on Detail Pages

**Movie detail page (when Radarr is configured):**
- Badge in the metadata section: "Available", "Monitored", "Downloading 45%", or "Not in Radarr"
- Badge colour: green (available), yellow (monitored/downloading), grey (not in Radarr)
- "Not in Radarr" for movies in POPS but not monitored in Radarr

**TV show detail page (when Sonarr is configured):**
- Badge: "Complete", "Partial (45/62 episodes)", "Monitored", or "Not in Sonarr"
- Same colour scheme

**When service is not configured:** Don't show the badge section at all. No "Radarr not connected" message cluttering the detail page.

### R6: Download Queue Display

Optional section on the media home page or a dedicated widget:

- List of currently downloading items from Radarr and Sonarr combined
- Each entry: title, type (movie/episode), progress percentage, ETA
- Auto-refreshes on a short interval (30 seconds when visible)
- Empty state: "Nothing downloading" or hidden entirely

### R7: Status Caching

Don't hit Radarr/Sonarr on every detail page load. Cache status locally:

- On first load of a detail page, fetch status from Radarr/Sonarr and cache in memory
- Cache TTL: 5 minutes for individual movie/show status
- Cache TTL: 30 seconds for download queue (when the queue widget is visible)
- Full refresh: fetch all monitored items from Radarr/Sonarr, build a lookup map by TMDB/TheTVDB ID
- Full refresh trigger: on manual "refresh" action, on app startup, every hour

No database table for cached status — in-memory only. The data is transient and sourced from Radarr/Sonarr.

### R8: Graceful Degradation

The media app must work fully without Radarr/Sonarr:

- If `RADARR_URL` is not set: no Radarr status badges, no error messages, no broken UI
- If `SONARR_URL` is not set: same for Sonarr
- If a configured service becomes unreachable: show "Radarr unavailable" badge (muted, not alarming), continue showing stale cached data if available
- Connection failures are logged but don't throw or crash the page

## Out of Scope

- Adding movies/shows to Radarr/Sonarr from POPS (future enhancement)
- Quality profile management
- Download client configuration
- Calendar / upcoming releases
- System health monitoring
- Any write operations to Radarr or Sonarr

## Acceptance Criteria

1. Radarr client connects and fetches monitored movies
2. Sonarr client connects and fetches monitored series
3. Connection test returns server version for each service
4. Movie detail page shows Radarr status badge when configured
5. TV show detail page shows Sonarr status badge when configured
6. Badges hidden when the respective service is not configured
7. Download queue widget shows active downloads with progress
8. Status cached in memory with appropriate TTLs
9. Graceful degradation when services are unreachable
10. TMDB ID matching for Radarr, TheTVDB ID matching for Sonarr
11. `.env.example` updated with all four variables (URL + key per service)
12. Unit tests for both clients (mocked responses)
13. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Shared *arr base client
**As a** developer, **I want** a shared HTTP client for the *arr API pattern **so that** Radarr and Sonarr clients share common logic.

**Acceptance criteria:**
- Base client handles authentication (`X-Api-Key`), request construction, error handling
- Radarr and Sonarr clients extend the base with service-specific endpoints
- Connection test works for both services
- Unit tests with mocked HTTP

### US-2: Radarr status on movie detail
**As a** user, **I want** to see the Radarr status of a movie on its detail page **so that** I know if it's downloaded or being monitored.

**Acceptance criteria:**
- Status badge: Available / Monitored / Downloading / Not in Radarr
- Colour-coded badge
- Hidden when Radarr not configured
- Status cached (not fetched on every page load)

### US-3: Sonarr status on TV show detail
**As a** user, **I want** to see the Sonarr status of a TV show on its detail page **so that** I know which episodes are available.

**Acceptance criteria:**
- Status badge: Complete / Partial (X/Y) / Monitored / Not in Sonarr
- Colour-coded badge
- Hidden when Sonarr not configured

### US-4: Download queue
**As a** user, **I want** to see what's currently downloading **so that** I know what will be available soon.

**Acceptance criteria:**
- Combined queue from Radarr + Sonarr
- Title, progress percentage, ETA per item
- Auto-refreshes when visible
- Empty state when nothing downloading

### US-5: Graceful degradation
**As a** developer, **I want** the media app to work fully without Radarr/Sonarr **so that** these integrations are optional.

**Acceptance criteria:**
- No errors when services aren't configured
- No badge sections when not configured
- Stale cache shown when service becomes unreachable
- Connection failures logged, not thrown
