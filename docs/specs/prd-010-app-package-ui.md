# PRD-010: App Package & Core UI

**Epic:** [02 — App Package & Core UI](../themes/media/epics/02-app-package-ui.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [002 — Shell Architecture](../architecture/adr-002-shell-architecture.md), [003 — Component Library & API](../architecture/adr-003-component-library-and-api.md), [004 — Tailwind-Only Styling](../architecture/adr-004-tailwind-only-styling.md), [009 — Local Image Caching](../architecture/adr-009-poster-local-cache.md)

## Problem Statement

The data model and metadata integrations exist, but there's no way to interact with media data from the UI. The first `@pops/app-media` workspace package needs to be created, integrated into the shell, and populated with core pages — library browsing, search, and detail views. This is also the first app package on the platform, validating the multi-app architecture from ADR-002.

## Goal

A `@pops/app-media` workspace package plugs into the shell via lazy-loaded routes. Users can browse their library, search for new movies and TV shows, view detail pages, and add media to their library — all from the UI. The architecture proof is as important as the feature delivery.

## Requirements

### R1: Package Scaffold

Create `packages/app-media/`:

```
packages/app-media/
  package.json                (@pops/app-media)
  tsconfig.json               (extends workspace base)
  src/
    index.ts                  (public exports)
    routes.tsx                (route definitions — exported for shell lazy import)
    pages/
      LibraryPage.tsx
      MovieDetailPage.tsx
      TvShowDetailPage.tsx
      SeasonDetailPage.tsx
      SearchPage.tsx
    components/
      MediaCard.tsx
      MediaCard.stories.tsx
      MediaGrid.tsx
      MediaGrid.stories.tsx
      MediaDetail.tsx
      MediaDetail.stories.tsx
      EpisodeList.tsx
      EpisodeList.stories.tsx
      SearchResults.tsx
      SearchResults.stories.tsx
      MediaTypeBadge.tsx
      MediaTypeBadge.stories.tsx
      GenreTags.tsx
      GenreTags.stories.tsx
    hooks/
      useMediaLibrary.ts      (tRPC query hooks for library data)
      useSearch.ts            (tRPC query hooks for search)
```

**package.json:**
```json
{
  "name": "@pops/app-media",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./routes": "./src/routes.tsx"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "dependencies": {
    "@pops/ui": "workspace:*"
  }
}
```

### R2: Shell Integration

The shell lazily imports media routes per ADR-002:

```typescript
// In pops-shell/src/app/router.tsx
const mediaRoutes = lazy(() => import('@pops/app-media/routes'));
```

**App switcher registration:**
- Icon: Film/clapperboard icon (from Lucide or similar)
- Label: "Media"
- Route prefix: `/media`
- Position: after Finance in the app list

**Route definitions exported from `@pops/app-media/routes`:**

```typescript
export const mediaRoutes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: 'movies/:id', element: <MovieDetailPage /> },
  { path: 'tv/:id', element: <TvShowDetailPage /> },
  { path: 'tv/:id/season/:num', element: <SeasonDetailPage /> },
  { path: 'search', element: <SearchPage /> },
];
```

### R3: Library Page (`/media`)

The main landing page for the media app. Displays all movies and TV shows in the local library.

**Layout:**
- Header with "Library" title and search link
- Filter bar: type toggle (All / Movies / TV Shows), genre dropdown, watched status (All / Watched / Unwatched)
- Sort options: title (A-Z), date added (newest), release date (newest), rating (highest)
- `MediaGrid` of `MediaCard` components
- Infinite scroll or "Load more" for large libraries

**Data source:** `media.movies.list` and `media.tvShows.list` tRPC queries, merged and sorted client-side (or a combined `media.library.list` if a unified endpoint is added).

**Empty state:** When the library is empty, show a clear call-to-action: "Your library is empty. Search for movies and shows to get started." with a link to `/media/search`.

### R4: MediaCard Component

The primary visual unit — a card representing a movie or TV show.

**Anatomy:**
- Poster image (from local cache endpoint `/media/images/{type}/{id}/poster.jpg`)
- Title (truncated to 2 lines if long)
- Year (release year for movies, first air year for TV)
- Type badge: "Movie" or "TV" (small, top corner of poster)
- Watched indicator: checkmark overlay on poster if fully watched
- For TV shows: progress indicator (e.g., "3/10 episodes" or a mini progress bar)

**Variants:**
- Grid variant: poster-dominant, vertical layout (~180px wide)
- List variant: horizontal layout with poster thumbnail + metadata side-by-side (stretch goal — grid first)

**Interaction:**
- Click → navigate to detail page (`/media/movies/{id}` or `/media/tv/{id}`)

**Responsive:**
- Grid columns: 2 on mobile (375px), 3 on tablet (768px), 4-6 on desktop (1024px+)
- Poster aspect ratio: 2:3, maintained via `aspect-ratio` CSS

### R5: Movie Detail Page (`/media/movies/:id`)

Full detail view for a single movie.

**Layout:**
- Hero section: backdrop image as full-width background (gradient overlay for text readability), poster on the left, title + tagline + year + runtime on the right
- If logo image available, display logo over backdrop instead of plain text title
- Below hero:
  - Overview (synopsis text)
  - Genre tags (clickable → filter library by genre)
  - Metadata grid: status, language, budget, revenue, TMDB rating
  - Cast summary: first 5-10 cast members with character names (from TMDB data stored in the movie record, or fetched on demand — see edge cases)

**Actions (placeholder slots for Epics 3-4):**
- "Add to watchlist" button (disabled/placeholder until Epic 3)
- "Mark as watched" button (disabled/placeholder until Epic 3)
- Comparison scores section (empty until Epic 4)

**Data source:** `media.movies.getById` tRPC query

### R6: TV Show Detail Page (`/media/tv/:id`)

Full detail view for a TV show.

**Layout:**
- Hero section: same pattern as movies — backdrop, poster/logo, title, first/last air date, status
- Below hero:
  - Overview
  - Genre tags
  - Network tags
  - Metadata: number of seasons, total episodes, average episode runtime
  - Progress bar: "X / Y episodes watched" (placeholder until Epic 3 — display 0/Y for now)
  - Season list: vertical list of season cards, each showing:
    - Season number and name (if named)
    - Poster thumbnail (if available)
    - Episode count
    - Air date of first episode
    - Click → navigate to season detail page

**Data source:** `media.tvShows.getById` tRPC query (returns show + seasons)

### R7: Season Detail Page (`/media/tv/:id/season/:num`)

Episode-level view for a single season.

**Layout:**
- Breadcrumb: Media → [Show Name] → Season N
- Season header: poster (if available), name, overview, episode count
- Episode list: vertical list of episode rows, each showing:
  - Episode number
  - Name
  - Air date
  - Runtime
  - Watch toggle (placeholder until Epic 3 — displayed but non-functional)
  - Brief overview (expandable/collapsible)

**Data source:** `media.tvShows.getSeason` tRPC query (returns season + episodes)

### R8: Search Page (`/media/search`)

Search for movies and TV shows to add to the library.

**Layout:**
- Search input with debounced query (300ms debounce)
- Type toggle: Movies / TV Shows / Both
- Results in a grid or list:
  - `SearchResults` component for each result
  - Poster thumbnail (from TMDB/TheTVDB CDN URL — not local cache, since these aren't in the library yet)
  - Title, year, overview (truncated), genre tags, community rating
  - "Add to Library" button per result
  - If already in library: show "In Library" badge instead of add button

**Search behaviour:**
- Movies search via `media.search.movies` (TMDB)
- TV shows search via `media.search.tvShows` (TheTVDB)
- "Both" mode fires both queries in parallel, merges results
- Show loading skeleton while searching
- Show "No results" message when search returns empty

**Add to library flow:**
- Click "Add to Library" → calls `media.library.addMovie` or `media.library.addTvShow`
- Button shows loading spinner during add
- On success: button changes to "In Library" badge
- On error: show toast notification with error message

### R9: Image Handling

All images served from the local cache endpoint (for library items) or external CDN (for search results):

**Library items:**
- Poster: `GET /media/images/{movie|tv}/{id}/poster.jpg`
- Backdrop: `GET /media/images/{movie|tv}/{id}/backdrop.jpg`
- Logo: `GET /media/images/{movie|tv}/{id}/logo.png`
- Fallback to generated placeholder (handled by the image endpoint — see PRD-008 R7)

**Search results (not yet in library):**
- Movies: TMDB CDN URL directly (`https://image.tmdb.org/t/p/w342/{posterPath}`)
- TV shows: TheTVDB image URL from search results

**Loading state:** Show `Skeleton` component (from `@pops/ui`) in poster dimensions while images load.

### R10: Responsive Design

All pages and components must work at three breakpoints:

| Breakpoint | Width | Grid columns | Notes |
|-----------|-------|-------------|-------|
| Mobile | 375px | 2 | Primary target — phone viewport |
| Tablet | 768px | 3-4 | iPad / landscape phone |
| Desktop | 1024px+ | 4-6 | Browser |

**Specific responsive behaviour:**
- Detail page hero: stacked layout on mobile (poster above text), side-by-side on tablet+
- Episode list: full width on all viewports
- Search input: full width on mobile, constrained on desktop
- MediaCard poster sizes scale with grid column width

All sizing uses Tailwind design tokens from `@pops/ui` — no arbitrary values (per ADR-004).

## Out of Scope

- Watchlist page and management (PRD-011)
- Watch history page and tracking toggles (PRD-012)
- Comparison UI and ratings display (PRD-013)
- Discovery/recommendation feed (PRD-014)
- Plex sync status indicators (PRD-015)
- Radarr/Sonarr status badges (PRD-016)
- Cast/crew storage or dedicated person pages
- Offline mode / service worker caching of media data
- Animations or transitions (functional first, polish later)

## Acceptance Criteria

1. `packages/app-media/` exists as a workspace package and resolves correctly
2. Media appears in the shell app switcher with correct icon and label
3. Shell lazily imports media routes — no media code loaded until `/media` is navigated to
4. Library page displays movies and shows from the database with poster images
5. Library page filtering works: by type, genre, watched status
6. Library page sorting works: by title, date added, release date, rating
7. Library page shows empty state with CTA when library is empty
8. Movie detail page displays full metadata with hero backdrop
9. TV show detail page displays show info with season list
10. Season detail page displays episode list
11. Search page returns results from TMDB (movies) and TheTVDB (TV)
12. "Add to Library" button works and updates to "In Library" on success
13. All pages are responsive at 375px, 768px, and 1024px
14. Storybook discovers and renders all media component stories
15. `pnpm typecheck` passes across all packages
16. No runtime regressions in existing finance app
17. All images use the local cache endpoint for library items and degrade gracefully on failure

## Edge Cases & Decisions

**Q: Should the library page use a unified endpoint or merge two queries?**
A: Start with two parallel queries (`movies.list` + `tvShows.list`), merged client-side. If performance becomes an issue with large libraries, add a `media.library.list` unified endpoint later. At the expected scale (<3,000 items), two queries is fine.

**Q: What about cast/crew on the movie detail page?**
A: TMDB returns cast data in the movie detail response, but we don't store it locally (out of scope per theme README). Options: (a) fetch cast on-demand when the detail page loads (extra TMDB API call per view), or (b) skip cast display in v1. Recommend (a) — one extra API call is negligible, and cast info is valuable for the detail page. Cache the response in-memory for the session.

**Q: What happens when clicking a genre tag?**
A: Navigate to `/media?genre={genreName}` — the library page with a pre-applied genre filter.

**Q: List view vs grid view?**
A: Grid view only in v1. List view is a future enhancement. Grid is the more visually engaging default and works better with poster images.

**Q: How does the search page handle "Both" mode?**
A: Fire `media.search.movies` and `media.search.tvShows` in parallel via `Promise.all` (or tRPC's parallel queries). Merge results into a single list, interleaving by relevance score if available, or movies-first then TV. Each result has a clear type badge.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all pass.

### US-1: Create @pops/app-media package scaffold
**As a** developer, **I want** the `@pops/app-media` workspace package to exist with correct configuration **so that** the shell can import media routes.

**Acceptance criteria:**
- `packages/app-media/package.json` exists with correct name, exports, peer deps
- `packages/app-media/tsconfig.json` extends workspace base
- `packages/app-media/src/routes.tsx` exports route definitions
- `pnpm install` resolves the workspace package
- Shell can `lazy(() => import('@pops/app-media/routes'))` without error

### US-2: Register media in app switcher
**As a** user, **I want** to see "Media" in the app switcher **so that** I can navigate to the media app.

**Acceptance criteria:**
- Media appears in the shell app switcher with a film/clapperboard icon
- Clicking "Media" navigates to `/media`
- Media routes are lazily loaded (not in the initial bundle)
- Active state is shown when on a `/media/*` route

### US-3: Library page
**As a** user, **I want** to browse all movies and TV shows in my library **so that** I can see what I have.

**Acceptance criteria:**
- Grid of `MediaCard` components displays all library items
- Filter by type (All / Movies / TV Shows)
- Filter by genre (dropdown of all genres in the library)
- Sort by title, date added, release date, rating
- Empty state with CTA shown when library is empty
- Responsive: 2 columns on mobile, 3-4 on tablet, 4-6 on desktop
- Loading skeleton shown while data fetches

### US-4: MediaCard component
**As a** user, **I want** each item in the grid to show a poster, title, year, and type **so that** I can identify items at a glance.

**Acceptance criteria:**
- Poster image loads from local cache endpoint
- Title truncated to 2 lines
- Year displayed below title
- Type badge ("Movie" / "TV") in top corner
- Click navigates to detail page
- Storybook story with variants: movie, TV show, long title, no poster (placeholder)

### US-5: Movie detail page
**As a** user, **I want** to see full details for a movie **so that** I can learn about it.

**Acceptance criteria:**
- Hero section with backdrop, poster, title, tagline, year, runtime
- Logo rendered over backdrop when available
- Overview, genre tags, metadata grid
- Genre tags clickable → navigate to library with genre filter
- Responsive: stacked on mobile, side-by-side on tablet+
- 404 page if movie ID doesn't exist
- Storybook story for `MediaDetail` component

### US-6: TV show detail page
**As a** user, **I want** to see show details and a list of seasons **so that** I can navigate to specific seasons.

**Acceptance criteria:**
- Hero section with show metadata
- Season list with poster thumbnails, episode counts, air dates
- Click season → navigate to `/media/tv/{id}/season/{num}`
- 404 if show ID doesn't exist

### US-7: Season detail page
**As a** user, **I want** to see all episodes in a season **so that** I can view episode details.

**Acceptance criteria:**
- Breadcrumb navigation: Media → Show Name → Season N
- Episode list with number, name, air date, runtime
- Expandable overview per episode
- 404 if season doesn't exist
- Storybook story for `EpisodeList` component

### US-8: Search page
**As a** user, **I want** to search for movies and TV shows and add them to my library **so that** I can build my collection.

**Acceptance criteria:**
- Search input with 300ms debounce
- Type toggle: Movies / TV Shows / Both
- Results show poster, title, year, overview, genres, rating
- "Add to Library" button per result
- Button shows loading state during add, changes to "In Library" on success
- Items already in library show "In Library" badge immediately
- Error toast on add failure
- "No results" message for empty search
- Loading skeletons while searching
- Storybook story for `SearchResults` component
