/**
 * E2E — Media library: search TMDB and add a movie (#2115)
 *
 * Tier 2 flow covering the add-to-library path that starts from /media:
 *   1. Navigate to /media, follow the header "Search" link to /media/search.
 *   2. Type a query; the mocked TMDB search returns a single, deterministic
 *      movie result that is NOT present in the mocked library.
 *   3. Click "Add to Library" on the result card.
 *   4. Assert the success toast surfaces and the card flips to the
 *      "In Library" badge (optimistic session state on the search page).
 *   5. Navigate back to /media and assert the new movie now appears in the
 *      library grid — the MediaCard link exposes `${title} (Movie)` as its
 *      accessible name.
 *
 * The page reads its data via the generated media Hey API client
 * (`@pops/app-media`, baseUrl `/media-api`; the shell strips the prefix).
 * The pillar backends are not started for e2e, so EVERY route the library
 * and search pages touch is mocked here — an unmocked `/media-api/*` request
 * would hit a dead proxy target and (via the queryFn throw) trip the
 * zero-console-error assertion.
 *
 * Routes mocked:
 *   GET  /media-api/library                    — { data: LibraryItem[], pagination }
 *   GET  /media-api/library/genres             — { data: string[] }
 *   GET  /media-api/arr/config                 — { data: { radarrConfigured:false, sonarrConfigured:false } }
 *   GET  /media-api/rotation/scheduler/leaving — { data: [] }
 *   GET  /media-api/movies                      — { data: [], pagination } (in-library lookup)
 *   GET  /media-api/tv-shows                    — { data: [], pagination } (in-library lookup)
 *   GET  /media-api/search/movies               — bare { results, totalResults, totalPages, page }
 *   GET  /media-api/search/tv-shows             — bare { results }
 *   POST /media-api/library/movies              — { data: Movie, created, message } (add mutation)
 *
 * `arr/config` reports nothing configured so `arr/queue` never fires.
 *
 * Idempotency — the test uses a unique movie title/tmdbId NOT present in the
 * mocked library. No real DB writes occur. No cleanup required.
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
// package or its generated Hey API client, so neither `@pops/media` nor
// `pillars/media/app/src/media-api/types.gen.ts` is reachable from here.
//
// `rotationStatus` below is typed nullable, matching the media pillar's own
// `MovieSchema` (`pillars/media/src/contract/rest-movies.ts`) and the
// committed OpenAPI source (`pillars/media/openapi/media.openapi.json`,
// `/library/movies` POST 200, `data.rotationStatus`:
// `{ enum: ['leaving','protected'], nullable: true }`) — DELIBERATELY NOT
// matching the generated Hey API client
// (`pillars/media/app/src/media-api/types.gen.ts`,
// `LibraryAddMovieResponses[200].data.rotationStatus: 'leaving' | 'protected'`,
// no `null`). The generated type has drifted stricter than the real
// contract: a freshly-added movie has no rotation status yet, so a real 200
// here legitimately carries `rotationStatus: null`, which the generated
// client's own type system would reject. The FE code that reads this field
// trusts the generated type, not this stub, so the drift is real and
// unaffected by this file — it is tracked separately, not fixed here.
// ---------------------------------------------------------------------------

/** Mirrors `MovieSearchResultSchema` (`pillars/media/src/contract/rest-search.ts`). */
const TmdbSearchResultSchema = z
  .object({
    tmdbId: z.number(),
    title: z.string(),
    originalTitle: z.string(),
    overview: z.string(),
    releaseDate: z.string(),
    posterPath: z.string().nullable(),
    backdropPath: z.string().nullable(),
    voteAverage: z.number(),
    voteCount: z.number(),
    genreIds: z.array(z.number()),
    originalLanguage: z.string(),
    popularity: z.number(),
  })
  .strict();

/** `GET /search/movies` 200 — `mediaSearchContract.movies` (`rest-search.ts`). */
const TmdbSearchResponseSchema = z
  .object({
    results: z.array(TmdbSearchResultSchema),
    totalResults: z.number(),
    totalPages: z.number(),
    page: z.number(),
  })
  .strict();

/** Mirrors `TvShowSearchResultSchema` (`pillars/media/src/contract/rest-search.ts`). */
const TvShowSearchResultSchema = z
  .object({
    tvdbId: z.number(),
    name: z.string(),
    originalName: z.string().nullable(),
    overview: z.string().nullable(),
    firstAirDate: z.string().nullable(),
    status: z.string().nullable(),
    posterPath: z.string().nullable(),
    genres: z.array(z.string()),
    originalLanguage: z.string().nullable(),
    year: z.string().nullable(),
  })
  .strict();

/** `GET /search/tv-shows` 200 — `mediaSearchContract.tvShows` (`rest-search.ts`). */
const TvShowSearchResponseSchema = z
  .object({ results: z.array(TvShowSearchResultSchema) })
  .strict();

/**
 * Mirrors `MovieSchema` (`pillars/media/src/contract/rest-movies.ts`). See
 * the `rotationStatus` note above for why it is nullable here.
 */
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
    rotationStatus: z.enum(['leaving', 'protected']).nullable(),
    rotationExpiresAt: z.string().nullable(),
  })
  .strict();

/** `POST /library/movies` 200 — `mediaLibraryContract.addMovie` (`rest-library.ts`). */
const AddMovieResponseSchema = z
  .object({ data: MovieSchema, created: z.boolean(), message: z.string() })
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

/** Mirrors `LibraryItemSchema` (`pillars/media/src/contract/rest-library.ts`). */
const LibraryItemSchema = z
  .object({
    id: z.number(),
    type: z.enum(['movie', 'tv']),
    title: z.string(),
    year: z.number().nullable(),
    posterUrl: z.string().nullable(),
    cdnPosterUrl: z.string().nullable(),
    genres: z.array(z.string()),
    voteAverage: z.number().nullable(),
    createdAt: z.string(),
    releaseDate: z.string().nullable(),
  })
  .strict();

/** `GET /library` 200 — `mediaLibraryContract.list` (`rest-library.ts`); page-based pagination. */
const LibraryListResponseSchema = z
  .object({
    data: z.array(LibraryItemSchema),
    pagination: z
      .object({
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        totalPages: z.number(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict();

/** `GET /library/genres` 200 — `mediaLibraryContract.genres` (`rest-library.ts`). */
const GenresResponseSchema = z.object({ data: z.array(z.string()) }).strict();

/** Mirrors `ArrConfigSchema` (`pillars/media/src/contract/rest-arr-schemas.ts`). */
const ArrConfigResponseSchema = z
  .object({
    data: z.object({ radarrConfigured: z.boolean(), sonarrConfigured: z.boolean() }).strict(),
  })
  .strict();

/** Mirrors `LeavingMovieSchema` (`pillars/media/src/contract/rest-rotation-scheduler.ts`). */
const LeavingMovieSchema = z
  .object({
    id: z.number(),
    tmdbId: z.number(),
    title: z.string(),
    posterPath: z.string().nullable(),
    rotationExpiresAt: z.string().nullable(),
    rotationMarkedAt: z.string().nullable(),
  })
  .strict();

/** `GET /rotation/scheduler/leaving` 200 — `rotationSchedulerRoutes.schedulerLeavingMovies`. */
const RotationLeavingResponseSchema = z.object({ data: z.array(LeavingMovieSchema) }).strict();

// ---------------------------------------------------------------------------
// Fixture — a movie NOT in the mocked library. Inception (tmdbId 27205)
// starts the card in the "Add to Library" state.
// ---------------------------------------------------------------------------
const MOVIE_TMDB_ID = 27205;
const MOVIE_TITLE = 'Inception';
const MOVIE_RELEASE_DATE = '2010-07-16';
const MOVIE_OVERVIEW =
  'Dom Cobb is a skilled thief specialising in the extraction of valuable secrets from deep within the subconscious.';
const MOVIE_POSTER_PATH = '/e2e-inception-poster.jpg';
const MOVIE_BACKDROP_PATH = '/e2e-inception-backdrop.jpg';
const SEARCH_QUERY = 'inception';
/** Local DB id returned by the mocked add. Kept out of the seeded range. */
const LOCAL_MOVIE_ID = 999_001;
const NOW_ISO = '2026-04-24T00:00:00.000Z';

function buildSearchResult(): z.infer<typeof TmdbSearchResultSchema> {
  return {
    tmdbId: MOVIE_TMDB_ID,
    title: MOVIE_TITLE,
    originalTitle: MOVIE_TITLE,
    overview: MOVIE_OVERVIEW,
    releaseDate: MOVIE_RELEASE_DATE,
    posterPath: MOVIE_POSTER_PATH,
    backdropPath: MOVIE_BACKDROP_PATH,
    voteAverage: 8.4,
    voteCount: 34_000,
    genreIds: [28, 878],
    originalLanguage: 'en',
    popularity: 100,
  };
}

function buildSearchResponse(): z.infer<typeof TmdbSearchResponseSchema> {
  return {
    results: [buildSearchResult()],
    totalResults: 1,
    totalPages: 1,
    page: 1,
  };
}

function buildAddedMovie(): z.infer<typeof MovieSchema> {
  return {
    id: LOCAL_MOVIE_ID,
    tmdbId: MOVIE_TMDB_ID,
    imdbId: 'tt1375666',
    title: MOVIE_TITLE,
    originalTitle: MOVIE_TITLE,
    overview: MOVIE_OVERVIEW,
    tagline: 'Your mind is the scene of the crime.',
    releaseDate: MOVIE_RELEASE_DATE,
    runtime: 148,
    status: 'Released',
    originalLanguage: 'en',
    budget: 160_000_000,
    revenue: 825_500_000,
    posterPath: MOVIE_POSTER_PATH,
    posterUrl: `/media/images/movie/${MOVIE_TMDB_ID}/poster.jpg`,
    backdropPath: MOVIE_BACKDROP_PATH,
    backdropUrl: `/media/images/movie/${MOVIE_TMDB_ID}/backdrop.jpg`,
    logoPath: null,
    logoUrl: null,
    posterOverridePath: null,
    voteAverage: 8.4,
    voteCount: 34_000,
    genres: ['Action', 'Science Fiction'],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    rotationStatus: null,
    rotationExpiresAt: null,
  };
}

function buildLibraryItem(): z.infer<typeof LibraryItemSchema> {
  return {
    id: LOCAL_MOVIE_ID,
    type: 'movie',
    title: MOVIE_TITLE,
    year: 2010,
    posterUrl: `/media/images/movie/${MOVIE_TMDB_ID}/poster.jpg`,
    cdnPosterUrl: null,
    genres: ['Action', 'Science Fiction'],
    voteAverage: 8.4,
    createdAt: NOW_ISO,
    releaseDate: MOVIE_RELEASE_DATE,
  };
}

const EMPTY_PAGINATION = { total: 0, limit: 1000, offset: 0, hasMore: false };

function buildLibraryListBody(
  items: z.infer<typeof LibraryItemSchema>[]
): z.infer<typeof LibraryListResponseSchema> {
  return {
    data: items,
    pagination: {
      page: 1,
      pageSize: 24,
      total: items.length,
      totalPages: items.length > 0 ? 1 : 0,
      hasMore: false,
    },
  };
}

// ---------------------------------------------------------------------------
// REST mocks
// ---------------------------------------------------------------------------

type MockState = {
  /** Flips true after the add mutation fires so library.list includes the new row. */
  movieAdded: boolean;
};

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { movieAdded: false };

  // /library and its sub-paths (/library/genres, /library/movies) share a
  // prefix. Playwright matches the most-recently-added route first, so the
  // bare list route is registered FIRST and the more specific sub-paths LAST
  // so they take precedence for their URLs.
  await page.route('**/media-api/library?**', (route) => {
    // Body depends on `state.movieAdded`, mutated by the add mutation below —
    // validated per request, not once at setup, so a run where the add fires
    // after the list route was registered is checked against the contract too.
    const items = state.movieAdded ? [buildLibraryItem()] : [];
    const body = buildLibraryListBody(items);
    assertMatchesContract(LibraryListResponseSchema, body, 'library.list');
    return json(route, 200, body);
  });

  await page.route(
    '**/media-api/library/genres',
    fulfilWith(
      200,
      GenresResponseSchema,
      { data: ['Action', 'Science Fiction', 'Drama'] },
      'library.genres'
    )
  );

  await page.route('**/media-api/library/movies', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    // Sets `state.movieAdded`, which the list route above reads — the two
    // routes are coupled through mutable state, so this one stays a handler
    // (validated per request) rather than a pre-serialised `fulfilWith` body,
    // even though the body itself never varies.
    state.movieAdded = true;
    const body = { data: buildAddedMovie(), created: true, message: 'Movie added to library' };
    assertMatchesContract(AddMovieResponseSchema, body, 'library.addMovie');
    return json(route, 200, body);
  });

  // arr/config reports nothing configured so the polling arr/queue never fires.
  await page.route(
    '**/media-api/arr/config',
    fulfilWith(
      200,
      ArrConfigResponseSchema,
      { data: { radarrConfigured: false, sonarrConfigured: false } },
      'arr.config'
    )
  );

  await page.route(
    '**/media-api/rotation/scheduler/leaving',
    fulfilWith(200, RotationLeavingResponseSchema, { data: [] }, 'rotation.schedulerLeavingMovies')
  );

  // In-library lookup lists (search page) and watchlist maps. Empty so the
  // searched movie starts in the "Add to Library" state.
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

  // TMDB search — bare top-level `results` (NOT wrapped in `data`). The body
  // ignores the typed query text entirely, so it is genuinely static.
  await page.route(
    '**/media-api/search/movies?**',
    fulfilWith(200, TmdbSearchResponseSchema, buildSearchResponse(), 'search.movies')
  );

  await page.route(
    '**/media-api/search/tv-shows?**',
    fulfilWith(200, TvShowSearchResponseSchema, { results: [] }, 'search.tvShows')
  );

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Media — library: search TMDB and add a movie', () => {
  // State is mutated across steps (add → library.list), so serialise the
  // suite to avoid parallel tests stepping on the same page-scoped mock.
  test.describe.configure({ mode: 'serial' });

  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];

    // Register crash detection BEFORE navigation so first-load errors surface.
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
        // WebKit logs failed <img> loads as console.error; the mocked poster
        // paths point at a cache route that is not populated during e2e.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('adds a movie from TMDB search and it surfaces in the library grid', async ({ page }) => {
    // 1. Start on /media — mocked library.list returns an empty collection.
    await page.goto('/media');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

    // 2. Follow the header "Search" link to /media/search. Scope to the
    //    header region so the search-page input nav link isn't confused with
    //    other "Search" affordances on the page.
    await page.getByRole('link', { name: 'Search', exact: true }).first().click();
    await expect(page).toHaveURL(/\/media\/search/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();

    // 3. Type into the TMDB search. SearchInput uses a 300ms debounce; typing
    //    into the native <input> and waiting for the result card is enough —
    //    Playwright auto-waits for the mock response to resolve.
    await page.getByPlaceholder(/Search movies and TV shows/i).fill(SEARCH_QUERY);

    // 4. The mocked TMDB search returns one movie. The result card renders
    //    the title as an <h3>.
    const resultHeading = page.getByRole('heading', { level: 3, name: MOVIE_TITLE });
    await expect(resultHeading).toBeVisible();

    // 5. Click "Add to Library" on the result card. Semantic button label.
    //    `.filter({ visible: true })` guards against responsive duplicates.
    const addButton = page
      .getByRole('button', { name: /Add to Library/i })
      .filter({ visible: true })
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    // 6. The mocked mutation resolves → the card replaces the Add button
    //    with the "In Library" badge (session-level state). Also a success
    //    toast surfaces via sonner.
    await expect(page.getByText('In Library').filter({ visible: true }).first()).toBeVisible();
    await expect(
      page.getByText('Movie added to library').filter({ visible: true }).first()
    ).toBeVisible();

    // 7. Navigate back to /media — mocked library.list now returns the new
    //    movie. The MediaCard renders as a Link with aria-label
    //    `${title} (Movie)`, which is a stable semantic hook.
    await page.goto('/media');
    await expect(page.getByRole('link', { name: `${MOVIE_TITLE} (Movie)` }).first()).toBeVisible();
  });
});
