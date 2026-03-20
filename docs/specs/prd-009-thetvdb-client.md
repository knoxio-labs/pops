# PRD-009: TheTVDB Client (TV Shows)

**Epic:** [01 — Metadata Integration](../themes/media/epics/01-metadata-integration.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md), [009 — Local Image Caching](../architecture/adr-009-poster-local-cache.md), [011 — Drizzle ORM](../architecture/adr-011-drizzle-orm.md)

## Problem Statement

The media app requires TV show metadata (titles, overviews, posters, genres, seasons, episodes) without manual data entry. TheTVDB is the canonical source for TV metadata and is natively used by Sonarr and Plex for TV matching. A service layer is needed to search, fetch, and cache TheTVDB data — including the full show → season → episode hierarchy — and to download poster/backdrop images for local serving.

## Goal

A TheTVDB client service wraps the TheTVDB v4 API, providing TV show search, detail fetch, season/episode retrieval, and image download. An "add show to library" flow fetches full metadata and inserts the show with all seasons and episodes into the local database in one transaction. Images are cached locally per ADR-009.

## Requirements

### R1: TheTVDB API Client Service

Create `apps/pops-api/src/modules/media/thetvdb/`:

```
media/thetvdb/
  client.ts           (HTTP client for TheTVDB API v4)
  auth.ts             (token management — login, refresh)
  types.ts            (TheTVDB API response types, mapping functions)
  rate-limiter.ts     (shared with TMDB or separate instance)
  image-cache.ts      (download and serve TV images — extends movie image cache)
  service.ts          (orchestration — search, fetch, add-to-library)
  service.test.ts
  client.test.ts
  auth.test.ts
```

The client wraps the TheTVDB v4 REST API. It handles:
- Authentication (JWT token obtained via login endpoint)
- Request construction (base URL `https://api4.thetvdb.com/v4`, paths, query params)
- Response parsing (JSON → typed objects)
- Error handling (HTTP status codes → meaningful errors)
- Token refresh (tokens expire after 1 month)

### R2: Authentication

TheTVDB v4 uses a two-step auth process unlike TMDB's simple API key:

1. **Login:** `POST /login` with `{ apikey: "YOUR_KEY" }` → returns a Bearer token
2. **Subsequent requests:** `Authorization: Bearer {token}`
3. **Token lifetime:** ~1 month

**Token management (`auth.ts`):**

```typescript
interface TheTvdbAuth {
  getToken(): Promise<string>;  // returns cached token or re-authenticates
}
```

- On first request, call `/login` to obtain a token
- Cache the token in memory with its expiry time
- Before each request, check if the token is still valid
- If expired or close to expiry (<24h remaining), re-authenticate
- If a request returns 401, re-authenticate and retry once

**Configuration:**
- Environment variable: `THETVDB_API_KEY`
- Docker secret path: `/run/secrets/thetvdb_api_key` (production)
- Document in `.env.example`: `THETVDB_API_KEY=your_thetvdb_v4_api_key`
- Client throws a clear error on startup if the key is missing

### R3: TV Show Search

**TheTVDB endpoint:** `GET /search?q={query}&type=series`

```typescript
interface TvdbSearchResult {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  status: string | null;         // "Continuing", "Ended", etc.
  posterPath: string | null;     // TheTVDB image filename
  genres: string[];
  originalLanguage: string | null;
  year: string | null;
}

interface SearchResponse {
  results: TvdbSearchResult[];
}
```

**tRPC procedure:** `media.search.tvShows`

| Input | Type | Description |
|-------|------|-------------|
| `query` | `string` (min 1 char) | Search text |

TheTVDB search returns up to 50 results by default. No pagination parameter — results are ranked by relevance.

### R4: TV Show Detail Fetch

**TheTVDB endpoint:** `GET /series/{id}/extended`

The extended endpoint returns the full show record including artwork, seasons list, and character data.

```typescript
interface TvdbShowDetail {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  averageRuntime: number | null;
  genres: { id: number; name: string }[];
  networks: { id: number; name: string }[];
  seasons: TvdbSeasonSummary[];
  artworks: TvdbArtwork[];
}

interface TvdbSeasonSummary {
  tvdbId: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  imageUrl: string | null;
  episodeCount: number;
}

interface TvdbArtwork {
  id: number;
  type: number;       // 1=banner, 2=poster, 3=background, 5=icon, etc.
  imageUrl: string;
  language: string | null;
  score: number;       // community vote score
}
```

**Artwork type filtering:**
- Poster (type 2): pick the highest-scored English poster
- Background/backdrop (type 3): pick the highest-scored English background
- Logo: TheTVDB doesn't have a dedicated logo type — fall back to banner (type 1) or skip

### R5: Season and Episode Fetch

**TheTVDB endpoint:** `GET /series/{id}/episodes/default?season={number}`

Returns episodes for a specific season of a show. The `default` season type is the standard broadcast order.

```typescript
interface TvdbEpisode {
  tvdbId: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  imageUrl: string | null;     // episode still (not cached per ADR-009)
}
```

**Season types:** TheTVDB supports multiple season orderings (default, DVD, absolute). Use `default` — the standard broadcast order. This aligns with how Plex and Sonarr organise episodes.

### R6: Rate Limiter

TheTVDB does not publish strict rate limits but recommends caching. Implement a conservative rate limiter:

- Token bucket: 20 requests per 10 seconds (conservative — TheTVDB is less tolerant than TMDB)
- Same `TokenBucketRateLimiter` class used by the TMDB client (shared implementation, separate instance)
- If TheTVDB returns 429, back off exponentially (1s, 2s, 4s) up to 3 retries

### R7: Image Download and Local Cache

Per ADR-009, download and cache images locally on "add to library."

**TheTVDB image URLs:** Full URLs provided in the artwork/image fields (e.g., `https://artworks.thetvdb.com/banners/...`). Unlike TMDB, no size parameter needed — download the full-resolution image.

**Local storage layout:**
```
{MEDIA_IMAGES_DIR}/
  tv/{tvdb_id}/
    poster.jpg
    backdrop.jpg
    override.jpg          (user-uploaded, optional)
```

Reuse the `ImageCacheService` from PRD-008 with a TV-specific method:

```typescript
interface ImageCacheService {
  // existing from PRD-008
  downloadMovieImages(...): Promise<void>;
  // new
  downloadTvShowImages(tvdbId: number, posterUrl: string | null, backdropUrl: string | null): Promise<void>;
  deleteTvShowImages(tvdbId: number): Promise<void>;
}
```

**Download behaviour:**
- Select the best artwork from the show's artworks array (highest score, English preferred)
- Skip if no suitable artwork found
- Skip if local file already exists
- Download poster and backdrop concurrently
- Log failures but don't block the add-to-library flow

### R8: Add TV Show to Library Flow

The core user flow: search → select → add. This is more complex than movies because a single add populates the show, all seasons, and all episodes.

**tRPC procedure:** `media.library.addTvShow`

| Input | Type | Description |
|-------|------|-------------|
| `tvdbId` | `number` | TheTVDB series ID (from search results) |

**Steps:**
1. Check if a show with this `tvdb_id` already exists locally → if yes, return existing record
2. Fetch extended show detail from TheTVDB (`GET /series/{id}/extended`)
3. For each season in the show's season list, fetch episode data (`GET /series/{id}/episodes/default?season={n}`)
4. Map TheTVDB response to Drizzle insert values
5. Insert in a single transaction:
   - Insert `tv_shows` row
   - Insert all `seasons` rows
   - Insert all `episodes` rows
6. Download images in background (show poster + backdrop)
7. Return the created show record with seasons

**API call budget per add:**
- 1 call for show detail (includes season list)
- N calls for episode data (one per season)
- 1-2 calls for image downloads
- A 5-season show = ~8 API calls

At 20 req/10s rate limit, a single show add takes <5 seconds. Bulk imports (e.g., Plex library with 100 shows) need throttling — ~5 minutes for 100 shows.

### R9: Metadata Refresh

**tRPC procedure:** `media.library.refreshTvShow`

| Input | Type | Description |
|-------|------|-------------|
| `id` | `number` | Local TV show ID |
| `redownloadImages` | `boolean` (default false) | Force re-download images |
| `refreshEpisodes` | `boolean` (default true) | Re-fetch season/episode data |

**Steps:**
1. Get existing show record (need `tvdb_id`)
2. Fetch fresh detail from TheTVDB
3. Update local show record with new metadata (preserves `poster_override_path`)
4. If `refreshEpisodes`, re-fetch all season/episode data:
   - Update existing episodes (air dates, names may change for upcoming episodes)
   - Insert new episodes (new season aired since last refresh)
   - Do NOT delete episodes that are no longer in TheTVDB (data integrity)
5. If `redownloadImages`, delete and re-download cached images
6. Set `updated_at`

This is more complex than movie refresh because the episode hierarchy can change (new seasons air, episode counts change for ongoing shows).

### R10: Response Mapping

TheTVDB v4 response structures differ from the local schema. Mapping functions convert between the two:

```typescript
// thetvdb/types.ts

function mapSearchResult(raw: TvdbApiSearchResult): TvdbSearchResult;
function mapShowDetail(raw: TvdbApiSeriesExtended): TvdbShowDetail;
function mapEpisode(raw: TvdbApiEpisode): TvdbEpisode;
function mapArtworks(artworks: TvdbApiArtwork[]): { posterUrl: string | null; backdropUrl: string | null };

// Convert TheTVDB detail to Drizzle insert values
function toTvShowInsert(detail: TvdbShowDetail): typeof tvShows.$inferInsert;
function toSeasonInsert(season: TvdbSeasonSummary, tvShowId: number): typeof seasons.$inferInsert;
function toEpisodeInsert(episode: TvdbEpisode, seasonId: number): typeof episodes.$inferInsert;
```

**Genre mapping:** TheTVDB returns genre objects with `{ id, name }`. Extract names into the JSON string array format used in the `genres` column.

**Network mapping:** Same pattern — extract network names into JSON array for the `networks` column.

## Out of Scope

- TMDB client (PRD-008 — separate PRD)
- Person/cast/crew storage
- Trending/popular/upcoming feeds (PRD-014 — Discovery)
- Image resizing or thumbnails (serve originals per ADR-009)
- Episode still image caching (posters and backdrops only)
- Alternative season orderings (DVD, absolute) — default broadcast order only
- TheTVDB movie data (TMDB handles movies)

## Acceptance Criteria

1. TheTVDB client authenticates via login endpoint and manages token lifecycle
2. Token auto-refreshes when expired or close to expiry
3. TV show search returns results matching the TheTVDB response format
4. Show detail fetch returns all fields needed for the `tv_shows` table plus season summaries
5. Episode fetch returns all episodes for a given season
6. Rate limiter prevents exceeding 20 req/10s
7. Images download to the correct local directory structure (`tv/{tvdb_id}/`)
8. Image serving endpoint handles TV images via the same route as movies (`/media/images/tv/{tvdb_id}/poster.jpg`)
9. "Add show to library" creates the show, all seasons, and all episodes in one transaction
10. Adding a show that already exists returns the existing record (no duplicate)
11. Metadata refresh updates show metadata and adds new episodes without deleting existing ones
12. Poster override is preserved on refresh
13. `.env.example` updated with `THETVDB_API_KEY`
14. Unit tests for: TheTVDB client (mocked HTTP), auth/token management, rate limiter, artwork selection, response mapping
15. Integration test for add-to-library flow (mocked TheTVDB responses)
16. `pnpm typecheck` passes
17. `pnpm test` passes

## Edge Cases & Decisions

**Q: What if TheTVDB returns a show with no seasons?**
A: Insert the show record with zero seasons. This can happen for announced but not-yet-aired shows. Episode data will be populated on a future metadata refresh.

**Q: What if a season has zero episodes?**
A: Insert the season record with zero episodes. Same rationale — upcoming seasons may not have episode data yet.

**Q: What about specials (season 0)?**
A: Include them. TheTVDB uses season 0 for specials. Insert as a regular season with `season_number = 0`. The UI can decide whether to display specials or hide them.

**Q: What if the TheTVDB token expires mid-bulk-import?**
A: The auth module checks token validity before each request. If a request fails with 401, re-authenticate and retry once. The token lasts a month — mid-import expiry is extremely unlikely but handled.

**Q: Should we share the rate limiter instance with TMDB?**
A: No. Separate instances — they're different APIs with different limits. The `TokenBucketRateLimiter` class is reused, but each API gets its own instance with its own configuration.

**Q: What about shows where TheTVDB and TMDB both have data?**
A: TheTVDB is authoritative for TV. We don't cross-reference TMDB for TV metadata. If a show exists in both, the `tvdb_id` is the canonical identifier. No `tmdb_id` column on the `tv_shows` table.

**Q: How to handle TheTVDB's paid subscription model?**
A: The free tier API key is sufficient for personal use. TheTVDB's paid tiers are for commercial redistribution. A self-hosted single-user system falls under personal use.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all pass.

### US-1: TheTVDB API client with auth
**As a** developer, **I want** a typed HTTP client for the TheTVDB v4 API with token-based authentication **so that** other services can search and fetch TV show data.

**Acceptance criteria:**
- Client authenticates via `POST /login` with API key from `THETVDB_API_KEY`
- Token cached in memory with expiry tracking
- Token auto-refreshes on expiry or 401 response
- Client exposes: `searchSeries(query)`, `getSeriesExtended(tvdbId)`, `getSeriesEpisodes(tvdbId, seasonNumber)`
- All responses are typed (not `any`)
- HTTP errors throw typed errors with status code and message
- Unit tests with mocked HTTP cover: success, 401 (triggers re-auth), 404, network error

### US-2: Rate limiter
**As a** developer, **I want** a rate limiter for TheTVDB requests **so that** we don't get throttled.

**Acceptance criteria:**
- Separate `TokenBucketRateLimiter` instance (20 tokens, 2 tokens/sec refill)
- All TheTVDB client requests go through the limiter
- 429 responses trigger exponential backoff (up to 3 retries)
- Unit test verifies throttling behaviour

### US-3: TV image cache
**As a** developer, **I want** TV show images downloaded and cached locally **so that** the UI serves images without external API calls.

**Acceptance criteria:**
- Images download to `{MEDIA_IMAGES_DIR}/tv/{tvdb_id}/poster.jpg` etc.
- Best artwork selected from show's artwork array (highest score, English preferred)
- Existing files not re-downloaded unless forced
- Missing artwork gracefully skipped
- Image serving endpoint handles `/media/images/tv/{tvdb_id}/poster.jpg`
- Generated placeholder for shows with no artwork

### US-4: Add TV show to library
**As a** developer, **I want** a single procedure that fetches TheTVDB metadata and creates the local show with all seasons and episodes **so that** adding a show is one action.

**Acceptance criteria:**
- `media.library.addTvShow({ tvdbId })` fetches detail + episodes, inserts show + seasons + episodes
- All inserts happen in a single Drizzle transaction
- Genres and networks mapped to string arrays
- Returns existing record if show already exists (idempotent)
- Images download in background
- Shows with no seasons/episodes are handled gracefully
- Specials (season 0) are included
- Integration test: mock TheTVDB responses → verify DB records created

### US-5: Metadata refresh
**As a** developer, **I want** to re-fetch TheTVDB metadata for an existing show **so that** new episodes and updated info are captured.

**Acceptance criteria:**
- `media.library.refreshTvShow({ id, redownloadImages, refreshEpisodes })` fetches fresh data
- Show metadata updated, `poster_override_path` preserved
- New episodes inserted, existing episodes updated (air dates, names)
- No episodes deleted (data integrity)
- New seasons inserted if a new season has aired
- `redownloadImages: true` re-downloads cached images
- `updated_at` set to current time

### US-6: Response mapping and type conversion
**As a** developer, **I want** typed mapping functions between TheTVDB API responses and local schema types **so that** the service layer doesn't deal with raw API shapes.

**Acceptance criteria:**
- Mapping functions for: search results, show detail, episodes, artworks
- Drizzle insert value builders for show, season, episode
- Genre and network name extraction from TheTVDB objects to string arrays
- Unit tests for each mapping function with realistic TheTVDB response fixtures
