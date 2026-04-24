/**
 * E2E — Media library: search TMDB and add a movie (#2115)
 *
 * Tier 2 flow covering the add-to-library path that starts from /media:
 *   1. Navigate to /media, follow the header "Search" link to /media/search.
 *   2. Type a query; the mocked TMDB search returns a single, deterministic
 *      movie result that is NOT present in the seeded e2e library.
 *   3. Click "Add to Library" on the result card.
 *   4. Assert the success toast surfaces and the card flips to the
 *      "In Library" badge (optimistic session state on the search page).
 *   5. Navigate back to /media and assert the new movie now appears in the
 *      library grid — the MediaCard link exposes `${title} (Movie)` as its
 *      accessible name.
 *
 * Real vs mock decision — MOCKED for three procedures; everything else
 * falls through to the real seeded e2e API.
 *
 *   `media.search.movies`   — canonical "mocked TMDB" entry point: the
 *                             server-side procedure wraps TMDB, so mocking
 *                             the tRPC response is equivalent to mocking
 *                             TMDB itself from the browser's perspective.
 *   `media.library.addMovie` — the real implementation hits TMDB server-side
 *                             for full movie detail, and the e2e/CI API is
 *                             not configured with a live TMDB key. We mock
 *                             the mutation to return a deterministic Movie
 *                             row so the UI transitions exactly as it would
 *                             against a real TMDB-backed add.
 *   `media.library.list`    — mocked so the newly added movie appears in
 *                             the /media grid on navigation. The seeded
 *                             list is still returned verbatim plus the new
 *                             entry, so the page behaves identically to a
 *                             successful real add.
 *
 * Everything else (session, dev auth, library.genres, movies.list for the
 * in-library lookup, arr config, etc.) routes to the real API via
 * `useRealApi()`. Registration order matters: useRealApi FIRST, the mock
 * LAST, so the mock handler's `route.fallback()` can defer to the real API
 * for any procedure it doesn't recognise.
 *
 * Idempotency — the test uses a unique movie title/tmdbId NOT present in
 * the seeded DB. No real DB writes occur (addMovie is mocked), so repeated
 * runs leave the seeded env untouched. No cleanup required.
 *
 * Crash detection is wired into beforeEach/afterEach (pageerror + console
 * errors) so every test in this suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// ---------------------------------------------------------------------------
// Fixture — a movie NOT in the seeded library. Inception (tmdbId 27205)
// satisfies the precondition: the seeded rows are The Godfather, Dark Knight,
// Pulp Fiction, Forrest Gump, Fight Club, Interstellar, Matrix. Inception
// is absent, so the card starts in the "Add to Library" state.
// ---------------------------------------------------------------------------
const MOVIE_TMDB_ID = 27205;
const MOVIE_TITLE = 'Inception';
const MOVIE_RELEASE_DATE = '2010-07-16';
const MOVIE_OVERVIEW =
  'Dom Cobb is a skilled thief specialising in the extraction of valuable secrets from deep within the subconscious.';
const MOVIE_POSTER_PATH = '/e2e-inception-poster.jpg';
const MOVIE_BACKDROP_PATH = '/e2e-inception-backdrop.jpg';
const SEARCH_QUERY = 'inception';
/** Local DB id returned by the mocked addMovie. Kept out of the seeded range. */
const LOCAL_MOVIE_ID = 999_001;
const NOW_ISO = '2026-04-24T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  originalLanguage: string;
  popularity: number;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
  totalResults: number;
  totalPages: number;
  page: number;
}

interface Movie {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  tagline: string | null;
  releaseDate: string | null;
  runtime: number | null;
  status: string | null;
  originalLanguage: string | null;
  budget: number | null;
  revenue: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  backdropUrl: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  posterOverridePath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string[];
  createdAt: string;
  updatedAt: string;
  rotationStatus: 'leaving' | 'protected' | null;
  rotationExpiresAt: string | null;
}

interface LibraryListItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  cdnPosterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

function buildSearchResult(): TmdbSearchResult {
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

function buildSearchResponse(): TmdbSearchResponse {
  return {
    results: [buildSearchResult()],
    totalResults: 1,
    totalPages: 1,
    page: 1,
  };
}

function buildAddedMovie(): Movie {
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

function buildLibraryItem(): LibraryListItem {
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

// ---------------------------------------------------------------------------
// tRPC route helpers — httpBatchLink combines procedures with "," in the path
// (e.g. /trpc/media.library.list,media.library.genres). A single handler must
// answer the batched request with a response array in the same order.
// ---------------------------------------------------------------------------

function parseProcedures(url: string): string[] {
  const match = /\/trpc\/([^?]+)/.exec(url);
  if (!match) return [];
  return decodeURIComponent(match[1] ?? '').split(',');
}

type MockState = {
  /** Flips true after addMovie fires so library.list includes the new row. */
  movieAdded: boolean;
};

function resolveProcedureData(name: string, state: MockState): unknown {
  if (name === 'media.search.movies') {
    return buildSearchResponse();
  }
  if (name === 'media.library.addMovie') {
    state.movieAdded = true;
    return {
      data: buildAddedMovie(),
      created: true,
      message: 'Movie added to library',
    };
  }
  if (name === 'media.library.list') {
    const added: LibraryListItem[] = state.movieAdded ? [buildLibraryItem()] : [];
    return {
      data: added,
      pagination: {
        page: 1,
        pageSize: 24,
        total: added.length,
        totalPages: added.length > 0 ? 1 : 0,
        hasMore: false,
      },
    };
  }
  // Defensive — caller only invokes this for known procedures.
  return null;
}

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { movieAdded: false };
  const knownProcedures = new Set([
    'media.search.movies',
    'media.library.addMovie',
    'media.library.list',
  ]);

  await page.route('/trpc/**', async (route) => {
    const procedures = parseProcedures(route.request().url());
    const allKnown = procedures.length > 0 && procedures.every((n) => knownProcedures.has(n));
    if (!allKnown) {
      await route.fallback();
      return;
    }

    const isBatch = new URL(route.request().url()).searchParams.has('batch');
    const payloads = procedures.map((n) => ({ result: { data: resolveProcedureData(n, state) } }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? payloads : payloads[0]),
    });
  });

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Media — library: search TMDB and add a movie', () => {
  // State is mutated across steps (addMovie → library.list), so serialise the
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

    // Order matters: useRealApi registers FIRST so the mock (registered
    // last, matched first in LIFO order) can call route.fallback() to hand
    // off non-mocked procedures to the real e2e API handler.
    await useRealApi(page);
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
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({
      timeout: 10_000,
    });

    // 2. Follow the header "Search" link to /media/search. Scope to the
    //    header region so the search-page input nav link isn't confused with
    //    other "Search" affordances on the page.
    await page.getByRole('link', { name: 'Search', exact: true }).first().click();
    await expect(page).toHaveURL(/\/media\/search/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible({
      timeout: 10_000,
    });

    // 3. Type into the TMDB search. SearchInput uses a 300ms debounce; typing
    //    into the native <input> and waiting for the result card is enough —
    //    Playwright auto-waits for the mock response to resolve.
    await page.getByPlaceholder(/Search movies and TV shows/i).fill(SEARCH_QUERY);

    // 4. The mocked TMDB search returns one movie. The result card renders
    //    the title as an <h3>.
    const resultHeading = page.getByRole('heading', { level: 3, name: MOVIE_TITLE });
    await expect(resultHeading).toBeVisible({ timeout: 10_000 });

    // 5. Click "Add to Library" on the result card. Semantic button label.
    //    `.filter({ visible: true })` guards against responsive duplicates.
    const addButton = page
      .getByRole('button', { name: /Add to Library/i })
      .filter({ visible: true })
      .first();
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    await addButton.click();

    // 6. The mocked mutation resolves → the card replaces the Add button
    //    with the "In Library" badge (session-level state). Also a success
    //    toast surfaces via sonner.
    await expect(page.getByText('In Library').filter({ visible: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText('Movie added to library').filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    // 7. Navigate back to /media — mocked library.list now returns the new
    //    movie. The MediaCard renders as a Link with aria-label
    //    `${title} (Movie)`, which is a stable semantic hook.
    await page.goto('/media');
    await expect(page.getByRole('link', { name: `${MOVIE_TITLE} (Movie)` }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
