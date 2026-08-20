/**
 * E2E — Media watchlist: trigger a Plex sync from the UI (#2132)
 *
 * Tier 3 flow covering the "Sync with Plex" button on /media/watchlist:
 *   1. Navigate to /media/watchlist with a mocked watchlist (4 items).
 *   2. Click "Sync with Plex" — kicks off the `plexSyncWatchlist` job.
 *   3. The button flips to "Syncing…" + disabled + spinner while the mocked
 *      job is in the `running` state.
 *   4. The mocked status poll transitions to `completed`; a success toast
 *      ("Watchlist sync complete") surfaces and the button returns to its
 *      idle "Sync with Plex" copy.
 *   5. The mocked watchlist items remain visible after the sync completes.
 *
 * The page reads its data via the generated media Hey API client
 * (`@pops/app-media`, baseUrl `/media-api`; the shell strips the prefix).
 * Every route the page touches is mocked here — the pillar backends are not
 * started for e2e, so an unmocked `/media-api/*` request would hit a dead
 * proxy target.
 *
 * Routes mocked:
 *   GET  /media-api/watchlist            — { data: WatchlistEntry[], pagination }
 *   GET  /media-api/movies               — { data: [], pagination } (titles come
 *   GET  /media-api/tv-shows             —   from each entry's own `title` field)
 *   GET  /media-api/plex/sync/active     — { data: [] } (no phantom running job)
 *   POST /media-api/plex/sync            — { data: { jobId } } (start mutation)
 *   GET  /media-api/plex/sync/:jobId     — { data: SyncJob } (running → completed)
 *
 * The poll interval is 1500ms (useStatusPolling); the first status poll returns
 * `running`, all subsequent polls return `completed`, so the UI exercises both
 * states without a real worker process.
 *
 * Crash detection is wired into beforeEach/afterEach (pageerror + console
 * errors) so every test in this suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { assertMatchesContract, json, fulfilWith, stubShellBoot } from './helpers/pillar-rest';

// ---------------------------------------------------------------------------
// Contract schemas — hand-mirrored from the media pillar's own zod schemas
// rather than imported. `shell-no-cross-internal` (`.dependency-cruiser.cjs`)
// lets the shell import another pillar's `@pops/app-<id>` UI package via its
// `index.ts` entrypoint only — not that pillar's own `@pops/<id>` contract
// package or its generated Hey API client, so neither is reachable here.
// ---------------------------------------------------------------------------

/** Mirrors `SyncJobSchema` (`pillars/media/src/contract/rest-plex-sync.ts`). */
const SyncJobSchema = z
  .object({
    id: z.string(),
    jobType: z.string(),
    status: z.enum(['running', 'completed', 'failed']),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    progress: z.object({ processed: z.number(), total: z.number() }).strict(),
    result: z.unknown(),
    error: z.string().nullable(),
  })
  .strict();

/** `POST /plex/sync` 200 — `plexSyncRoutes.startSyncJob`. */
const StartSyncResponseSchema = z
  .object({ data: z.object({ jobId: z.string() }).strict() })
  .strict();

/** `GET /plex/sync/active` 200 — `plexSyncRoutes.getActiveSyncJobs`. */
const ActiveSyncJobsResponseSchema = z.object({ data: z.array(SyncJobSchema) }).strict();

/** `GET /plex/sync/:jobId` 200 — `plexSyncRoutes.getSyncJobStatus`. */
const SyncJobStatusResponseSchema = z.object({ data: SyncJobSchema }).strict();

/**
 * Mirrors `WatchlistEntrySchema` (`pillars/media/src/contract/rest-watchlist.ts`).
 * `mediaType` is a bare string on the wire response, not the narrower
 * `AddToWatchlistBody` enum (`'movie' | 'tv_show'`) — the read schema does
 * not constrain it, so mirroring it as `z.string()` here (rather than a
 * literal union) matches what the server actually validates, not a stricter
 * shape a real response could legitimately violate.
 */
const WatchlistEntrySchema = z
  .object({
    id: z.number(),
    mediaType: z.string(),
    mediaId: z.number(),
    priority: z.number().nullable(),
    notes: z.string().nullable(),
    source: z.string().nullable(),
    plexRatingKey: z.string().nullable(),
    addedAt: z.string(),
    title: z.string().nullable(),
    posterUrl: z.string().nullable(),
  })
  .strict();

/** `PaginationMetaSchema` (`pillars/media/src/contract/rest-schemas.ts`). */
const PaginationMetaSchema = z
  .object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  })
  .strict();

/** `GET /watchlist` 200 — `mediaWatchlistContract.list` (`rest-watchlist.ts`). */
const WatchlistListResponseSchema = z
  .object({ data: z.array(WatchlistEntrySchema), pagination: PaginationMetaSchema })
  .strict();

/** Mirrors `MovieSchema` (`pillars/media/src/contract/rest-movies.ts`). */
const MovieSchema = z
  .object({
    id: z.number(),
    tmdbId: z.number(),
    imdbId: z.string().nullable(),
    title: z.string(),
    originalTitle: z.string().nullable(),
    overview: z.string().nullable(),
    tagline: z.string().nullable(),
    releaseDate: z.string().nullable(),
    runtime: z.number().nullable(),
    status: z.string().nullable(),
    originalLanguage: z.string().nullable(),
    budget: z.number().nullable(),
    revenue: z.number().nullable(),
    posterPath: z.string().nullable(),
    posterUrl: z.string().nullable(),
    backdropPath: z.string().nullable(),
    backdropUrl: z.string().nullable(),
    logoPath: z.string().nullable(),
    logoUrl: z.string().nullable(),
    posterOverridePath: z.string().nullable(),
    voteAverage: z.number().nullable(),
    voteCount: z.number().nullable(),
    genres: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    // Nullable per the media pillar's own `MovieSchema` and the committed
    // OpenAPI source (`nullable: true`) — see `media-library-search-add-movie.spec.ts`
    // for the drift this deliberately does not follow the generated Hey API
    // client into.
    rotationStatus: z.enum(['leaving', 'protected']).nullable(),
    rotationExpiresAt: z.string().nullable(),
  })
  .strict();

/** `GET /movies` 200 — `mediaMoviesContract.list` (`rest-movies.ts`). */
const MovieListResponseSchema = z
  .object({ data: z.array(MovieSchema), pagination: PaginationMetaSchema })
  .strict();

/** Mirrors `TvShowSchema` (`pillars/media/src/contract/rest-tv-shows-schemas.ts`). */
const TvShowSchema = z
  .object({
    id: z.number(),
    tvdbId: z.number(),
    name: z.string(),
    originalName: z.string().nullable(),
    overview: z.string().nullable(),
    firstAirDate: z.string().nullable(),
    lastAirDate: z.string().nullable(),
    status: z.string().nullable(),
    originalLanguage: z.string().nullable(),
    numberOfSeasons: z.number().nullable(),
    numberOfEpisodes: z.number().nullable(),
    episodeRunTime: z.number().nullable(),
    posterPath: z.string().nullable(),
    posterUrl: z.string().nullable(),
    backdropPath: z.string().nullable(),
    backdropUrl: z.string().nullable(),
    logoPath: z.string().nullable(),
    logoUrl: z.string().nullable(),
    posterOverridePath: z.string().nullable(),
    voteAverage: z.number().nullable(),
    voteCount: z.number().nullable(),
    genres: z.array(z.string()),
    networks: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

/** `GET /tv-shows` 200 — `mediaTvShowsContract.list` (`rest-tv-shows.ts`). */
const TvShowListResponseSchema = z
  .object({ data: z.array(TvShowSchema), pagination: PaginationMetaSchema })
  .strict();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_JOB_ID = 'e2e-plex-watchlist-sync-1';
const STARTED_AT = '2026-04-26T10:00:00.000Z';
const COMPLETED_AT = '2026-04-26T10:00:02.500Z';

function buildRunningJob(): z.infer<typeof SyncJobSchema> {
  return {
    id: MOCK_JOB_ID,
    jobType: 'plexSyncWatchlist',
    status: 'running',
    startedAt: STARTED_AT,
    completedAt: null,
    durationMs: null,
    progress: { processed: 1, total: 4 },
    result: null,
    error: null,
  };
}

function buildCompletedJob(): z.infer<typeof SyncJobSchema> {
  return {
    id: MOCK_JOB_ID,
    jobType: 'plexSyncWatchlist',
    status: 'completed',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    durationMs: 2500,
    progress: { processed: 4, total: 4 },
    result: { pushed: 4, pulled: 0 },
    error: null,
  };
}

// The watchlist items render their <h3> title from each entry's own `title`
// field (useWatchlistMediaMaps falls back to `entry.title` when the movie/tv
// map has no matching id), so the movies/tv-shows lists can be empty.
const WATCHLIST_ENTRIES: z.infer<typeof WatchlistEntrySchema>[] = [
  {
    id: 1,
    mediaType: 'movie',
    mediaId: 603,
    priority: 0,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'The Matrix',
    posterUrl: null,
  },
  {
    id: 2,
    mediaType: 'movie',
    mediaId: 157336,
    priority: 1,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Interstellar',
    posterUrl: null,
  },
  {
    id: 3,
    mediaType: 'movie',
    mediaId: 550,
    priority: 2,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Fight Club',
    posterUrl: null,
  },
  {
    id: 4,
    mediaType: 'tv',
    mediaId: 124364,
    priority: 3,
    notes: null,
    source: 'pops',
    plexRatingKey: null,
    addedAt: STARTED_AT,
    title: 'Shogun',
    posterUrl: null,
  },
];

const EMPTY_PAGINATION = { total: 0, limit: 500, offset: 0, hasMore: false };

// ---------------------------------------------------------------------------
// REST mocks
//
// State is mutated across status polls (running → completed), so the route
// closures share a single mutable object.
// ---------------------------------------------------------------------------

type MockState = {
  /** Increments each time the status route is polled. The first poll returns
   *  `running`, all subsequent polls return `completed`. */
  statusPolls: number;
};

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { statusPolls: 0 };

  await page.route(
    '**/media-api/watchlist?**',
    fulfilWith(
      200,
      WatchlistListResponseSchema,
      {
        data: WATCHLIST_ENTRIES,
        pagination: { total: WATCHLIST_ENTRIES.length, limit: 500, offset: 0, hasMore: false },
      },
      'watchlist.list'
    )
  );

  await page.route(
    '**/media-api/movies?**',
    fulfilWith(
      200,
      MovieListResponseSchema,
      { data: [], pagination: EMPTY_PAGINATION },
      'movies.list'
    )
  );

  await page.route(
    '**/media-api/tv-shows?**',
    fulfilWith(
      200,
      TvShowListResponseSchema,
      { data: [], pagination: EMPTY_PAGINATION },
      'tvShows.list'
    )
  );

  await page.route(
    '**/media-api/plex/sync/active',
    fulfilWith(200, ActiveSyncJobsResponseSchema, { data: [] }, 'plex.getActiveSyncJobs')
  );

  // POST /plex/sync starts the job; GET /plex/sync/:jobId polls its status
  // via a separate, more specific route pattern below, so this one only ever
  // sees the POST.
  await page.route(
    '**/media-api/plex/sync',
    fulfilWith(200, StartSyncResponseSchema, { data: { jobId: MOCK_JOB_ID } }, 'plex.startSyncJob')
  );

  await page.route(`**/media-api/plex/sync/${MOCK_JOB_ID}`, (route) => {
    // The response alternates running → completed across polls, so it is
    // validated per request rather than pre-serialised once by `fulfilWith`.
    state.statusPolls += 1;
    const job = state.statusPolls <= 1 ? buildRunningJob() : buildCompletedJob();
    const body = { data: job };
    assertMatchesContract(SyncJobStatusResponseSchema, body, 'plex.getSyncJobStatus');
    return json(route, 200, body);
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Media — watchlist: Plex sync push (mocked)', () => {
  // Mock state is mutated across status polls, so serialise the suite to
  // avoid parallel tests stepping on the same page-scoped mock.
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await stubShellBoot(page);
    await installMediaMocks(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // WebKit logs failed <img> loads as console.error; the seeded poster
        // paths point at a cache route that is not populated during e2e.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('triggers a Plex sync from the watchlist page and surfaces completion', async ({ page }) => {
    // 1. Navigate to /media/watchlist — the mocked list contains 4 items
    //    (Matrix, Interstellar, Fight Club, Shogun).
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeVisible();

    // The button starts in the idle state.
    const button = page.getByTestId('watchlist-plex-sync-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveText(/Sync with Plex/);
    await expect(button).toBeEnabled();

    // Confirm a watchlist item is visible BEFORE the sync — the WatchlistItem
    // renders the title in an <h3>.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible();

    // 2. Click the sync button. The first status poll returns `running`,
    //    so the button flips to "Syncing…" + disabled.
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveText(/Syncing…/);

    // 3. The poll interval is 1500ms (see useStatusPolling); the second
    //    poll returns `completed`. The hook surfaces a success toast and
    //    the button re-enables back to the idle copy.
    await expect(page.getByText('Watchlist sync complete').first()).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(/Sync with Plex/);

    // 4. The watchlist remains visible after the sync — the list query is
    //    invalidated on completion and re-fetches the same mocked rows.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible();
  });
});
