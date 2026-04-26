/**
 * E2E — Media watchlist: trigger a Plex sync from the UI (#2132)
 *
 * Tier 3 flow covering the new "Sync with Plex" button on /media/watchlist:
 *   1. Navigate to /media/watchlist with the seeded e2e watchlist (4 items).
 *   2. Click "Sync with Plex" — kicks off `media.plex.startSyncJob`.
 *   3. The button flips to "Syncing…" + disabled + spinner while the mocked
 *      job is in the `running` state.
 *   4. The mocked status poll transitions to `completed`; a success toast
 *      ("Watchlist sync complete") surfaces and the button returns to its
 *      idle "Sync with Plex" copy.
 *   5. The seeded watchlist items remain visible after the sync completes.
 *
 * Real vs mock decision — MOCKED for the three Plex sync procedures, the
 * watchlist list is passed through to the real e2e API.
 *
 *   `media.plex.startSyncJob`       — mocked: enqueueing a real sync job
 *                                     would attempt to contact Plex and
 *                                     write to the live BullMQ queue, which
 *                                     is not configured in CI.
 *   `media.plex.getSyncJobStatus`   — mocked to advance from `running` to
 *                                     `completed` on the second poll, so
 *                                     the UI exercises both states without
 *                                     a real worker process.
 *   `media.plex.getActiveSyncJobs`  — mocked empty so the hook does not
 *                                     restore a phantom running job at
 *                                     mount.
 *
 * Everything else (session, dev auth, `media.watchlist.list`,
 * `media.movies.list`, `media.tvShows.list`, etc.) routes to the real e2e
 * API via `useRealApi()` so the seeded list renders verbatim. Registration
 * order matters: `useRealApi` FIRST, the mock LAST, so the mock handler's
 * `route.fallback()` can defer to the real API for any procedure it does
 * not recognise.
 *
 * Idempotency — no real DB writes occur (the mocked `startSyncJob` returns
 * a synthetic job id), so repeated runs leave the seeded env untouched.
 *
 * Crash detection is wired into beforeEach/afterEach (pageerror + console
 * errors) so every test in this suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_JOB_ID = 'e2e-plex-watchlist-sync-1';
const STARTED_AT = '2026-04-26T10:00:00.000Z';
const COMPLETED_AT = '2026-04-26T10:00:02.500Z';

interface SyncJobProgress {
  processed: number;
  total: number;
}

interface SyncJob {
  id: string;
  jobType: 'plexSyncWatchlist';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

function buildRunningJob(): SyncJob {
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

function buildCompletedJob(): SyncJob {
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

// ---------------------------------------------------------------------------
// tRPC route helpers — httpBatchLink combines procedures with "," in the path
// (e.g. /trpc/media.plex.getActiveSyncJobs,media.watchlist.list?batch=1...).
// Mixed batches (known + unknown procedures) are split: known procedures are
// answered from the mock state, unknown ones are forwarded to the real e2e
// API in a separate request, and the two sets of responses are merged in
// the original procedure order before fulfilling the route.
//
// This is a direct port of the pattern in
// apps/pops-shell/e2e/media-library-search-add-movie.spec.ts.
// ---------------------------------------------------------------------------

const E2E_ENV = 'e2e';

function parseProcedures(url: string): string[] {
  const match = /\/trpc\/([^?]+)/.exec(url);
  if (!match) return [];
  return decodeURIComponent(match[1] ?? '').split(',');
}

type MockState = {
  /** Increments each time getSyncJobStatus is called. The first poll returns
   *  `running`, all subsequent polls return `completed`. */
  statusPolls: number;
  /** Flips true once the start mutation has fired. Defensive — used to
   *  surface a clearer error if status is polled before start. */
  jobStarted: boolean;
};

function resolveProcedureData(name: string, state: MockState): unknown {
  if (name === 'media.plex.getActiveSyncJobs') {
    return { data: [] };
  }
  if (name === 'media.plex.startSyncJob') {
    state.jobStarted = true;
    return { data: { jobId: MOCK_JOB_ID } };
  }
  if (name === 'media.plex.getSyncJobStatus') {
    state.statusPolls += 1;
    const job = state.statusPolls <= 1 ? buildRunningJob() : buildCompletedJob();
    return { data: job };
  }
  // Defensive — caller only invokes this for known procedures.
  return null;
}

type TrpcEnvelope = Record<string, unknown>;

function buildSubsetUrl(originalUrl: URL, procedures: string[], indexes: number[]): URL {
  const subsetProcedures = indexes.map((i) => procedures[i] ?? '').filter((n) => n.length > 0);
  const subsetUrl = new URL(originalUrl.toString());
  subsetUrl.pathname = `/trpc/${subsetProcedures.join(',')}`;

  const rawInput = originalUrl.searchParams.get('input');
  if (rawInput !== null) {
    const parsed: unknown = JSON.parse(rawInput);
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const reindexed: Record<string, unknown> = {};
      indexes.forEach((origIndex, newIndex) => {
        const value = record[String(origIndex)];
        if (value !== undefined) reindexed[String(newIndex)] = value;
      });
      subsetUrl.searchParams.set('input', JSON.stringify(reindexed));
    }
  }
  subsetUrl.searchParams.set('env', E2E_ENV);
  return subsetUrl;
}

async function installMediaMocks(page: Page): Promise<MockState> {
  const state: MockState = { statusPolls: 0, jobStarted: false };
  const knownProcedures = new Set([
    'media.plex.getActiveSyncJobs',
    'media.plex.startSyncJob',
    'media.plex.getSyncJobStatus',
  ]);

  await page.route('/trpc/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const procedures = parseProcedures(request.url());

    // No procedure names → defer to the next handler (real API).
    if (procedures.length === 0) {
      await route.fallback();
      return;
    }

    const knownIndexes: number[] = [];
    const unknownIndexes: number[] = [];
    procedures.forEach((name, i) => {
      if (knownProcedures.has(name)) knownIndexes.push(i);
      else unknownIndexes.push(i);
    });

    // Fully unknown batch → defer to useRealApi.
    if (knownIndexes.length === 0) {
      await route.fallback();
      return;
    }

    const isBatch = url.searchParams.has('batch');
    const merged: (TrpcEnvelope | undefined)[] = Array.from<TrpcEnvelope | undefined>({
      length: procedures.length,
    });

    for (const i of knownIndexes) {
      const name = procedures[i] ?? '';
      merged[i] = { result: { data: resolveProcedureData(name, state) } };
    }

    if (unknownIndexes.length > 0) {
      if (request.method() !== 'GET') {
        throw new Error(
          `Mixed known/unknown procedures in a non-GET batch is not supported: ${procedures.join(',')}`
        );
      }
      const subsetUrl = buildSubsetUrl(url, procedures, unknownIndexes);
      const realResponse = await route.fetch({ url: subsetUrl.toString() });
      const body: unknown = await realResponse.json();
      if (!Array.isArray(body)) {
        throw new Error(`Expected tRPC batch array response, got: ${typeof body}`);
      }
      const envelopes: TrpcEnvelope[] = body.map((entry): TrpcEnvelope => {
        if (typeof entry !== 'object' || entry === null) {
          throw new Error(`Expected tRPC envelope object, got: ${typeof entry}`);
        }
        return entry as TrpcEnvelope;
      });
      envelopes.forEach((env, j) => {
        const origIndex = unknownIndexes[j];
        if (origIndex !== undefined) merged[origIndex] = env;
      });
    }

    const finalEnvelopes: TrpcEnvelope[] = merged.map((env, i) => {
      if (env === undefined) {
        throw new Error(`Missing tRPC envelope for procedure ${procedures[i] ?? '?'}`);
      }
      return env;
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? finalEnvelopes : finalEnvelopes[0]),
    });
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
        // WebKit logs failed <img> loads as console.error; the seeded poster
        // paths point at a cache route that is not populated during e2e.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('triggers a Plex sync from the watchlist page and surfaces completion', async ({ page }) => {
    // 1. Navigate to /media/watchlist — the seeded list contains 4 items
    //    (Matrix, Interstellar, Fight Club, Shogun).
    await page.goto('/media/watchlist');
    await expect(page.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeVisible({
      timeout: 10_000,
    });

    // The button starts in the idle state.
    const button = page.getByTestId('watchlist-plex-sync-button');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toHaveText(/Sync with Plex/);
    await expect(button).toBeEnabled();

    // Confirm a seeded watchlist item is visible BEFORE the sync — the
    // WatchlistCard / WatchlistItem render the title in an <h3>.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // 2. Click the sync button. The first status poll returns `running`,
    //    so the button flips to "Syncing…" + disabled.
    await button.click();
    await expect(button).toBeDisabled({ timeout: 10_000 });
    await expect(button).toHaveText(/Syncing…/, { timeout: 10_000 });

    // 3. The poll interval is 1500ms (see useStatusPolling); the second
    //    poll returns `completed`. The hook surfaces a success toast and
    //    the button re-enables back to the idle copy.
    await expect(page.getByText('Watchlist sync complete').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(button).toBeEnabled({ timeout: 10_000 });
    await expect(button).toHaveText(/Sync with Plex/, { timeout: 10_000 });

    // 4. The seeded watchlist remains visible after the sync — the real
    //    API answered media.watchlist.list and is unaffected by the mock.
    await expect(page.getByRole('heading', { level: 3, name: 'The Matrix' }).first()).toBeVisible();
  });
});
