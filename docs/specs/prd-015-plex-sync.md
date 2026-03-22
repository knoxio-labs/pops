# PRD-015: Plex Sync

**Epic:** [06 — Plex Sync](../themes/media/epics/06-plex-sync.md)
**Theme:** Media
**Status:** Approved
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md)

## Problem Statement

The user has a Plex library with hundreds of movies and TV shows, plus watch history accumulated over years. Manually adding each item to POPS and marking it as watched would be tedious and defeat the "output > input" principle. Plex sync imports the existing library and keeps watch status in sync automatically.

## Goal

A polling-based sync service imports movies and TV shows from Plex, matches them to TMDB/TheTVDB, adds them to the POPS library, and syncs watch history at the episode level. Authentication must be handled dynamically via the official Plex PIN flow, and all server configuration must be managed via the UI.

## Requirements

### R1: Plex API Client

Create `apps/pops-api/src/modules/media/plex/`:

```
media/plex/
  client.ts           (HTTP client for Plex API)
  types.ts            (Plex API response types)
  matcher.ts          (match Plex items to TMDB/TheTVDB IDs)
  service.ts          (orchestration — import, sync, scheduling)
  router.ts           (tRPC procedures)
```

**Plex API basics:**
- Authentication: `X-Plex-Token` query parameter
- Client Identification: `X-Plex-Client-Identifier` header (stable UUID per app instance)
- Content type: `Accept: application/json`

### R2: Dynamic Plex Connection

**No environment variables for user settings.**
All connection data must be stored in the `settings` table (PRD-005):
- `plex_url` — Plex server base URL
- `plex_token` — Dynamically obtained authentication token
- `plex_client_identifier` — Stable UUID for this app instance

**tRPC procedures for connection management:**

| Procedure | Type | Description |
|-----------|------|-------------|
| `media.plex.getAuthPin` | mutation | Generate a Plex login PIN and URL |
| `media.plex.checkAuthPin` | mutation | Poll for successful authentication and save token |
| `media.plex.setUrl` | mutation | Validate and save the Plex Server URL |
| `media.plex.testConnection` | query | Verify Plex server is reachable and token is valid |
| `media.plex.getSyncStatus` | query | Return detailed configuration and sync status |
| `media.plex.disconnect` | mutation | Remove the authentication token from database |

**Validation Rules:**
- `setUrl` must perform a reachability test before saving.
- If a token exists, `setUrl` must perform an authenticated request to verify the combination.

### R3: TMDB/TheTVDB Matching

Plex items need to be matched to TMDB (movies) or TheTVDB (TV) IDs for insertion into the POPS library.

**Matching strategy (ordered by reliability):**

1. **Plex agent ID** — Extract ID from `plex://movie/{tmdb_id}` or `com.plexapp.agents.thetvdb://{tvdb_id}`.
2. **External IDs** — Extract from the `Guid` array.
3. **Title + year search** — Fall back to searching metadata providers.

### R4: Initial Library Import

**Steps for import:**
1. Fetch all items from the selected Plex library section.
2. Match to TMDB/TheTVDB.
3. Add to POPS library via existing library services.
4. If watched on Plex, create local `watch_history` entries.

### R5: Periodic Watch History Sync

**Scheduler:**
- Automatically polls Plex for new watch events.
- Interval and section IDs managed via scheduler service.
- Can be triggered manually via `media.plex.syncMovies` or `media.plex.syncTvShows`.

### R6: Plex Setup & Sync UI

**Location:** `/media/settings/plex`

**Setup Flow:**
1. **URL Entry**: User enters Plex Server URL. "Save" button validates reachability.
2. **Authentication**: "Connect to Plex" button opens official Plex sign-in.
3. **Polling**: UI polls `checkAuthPin` until connected.
4. **Library Selection**: Once connected, user selects libraries to sync.

**Display:**
- Status badges: "Connected", "Unconfigured", "Missing URL".
- Detailed error messages for failed connections.
- Last sync results per media type.

## Acceptance Criteria

1. Plex client connects using dynamic credentials from the database.
2. The 4-step PIN authentication flow is implemented and functional.
3. Server URL can be set and updated via the UI with mandatory validation.
4. Library discovery works only after successful authentication.
5. Watch history import uses Plex timestamps.
6. Periodic sync picks up new activity automatically.
7. Disconnecting Plex clears the token from the database.
8. `pnpm typecheck` and `pnpm test` pass.
9. No Plex secrets exist in `.env`.
