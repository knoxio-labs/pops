/**
 * The read-only removal preview (POPS-2719).
 *
 * The preview is only worth anything if it runs the same planner the cycle
 * runs, so these tests drive both against one fixture and compare, and they
 * pin the two properties that make it safe to call from a UI: it writes
 * nothing, and what a real cycle persists is enough to reconstruct why each
 * movie was picked.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  moviesService,
  openMediaDb,
  rotationLogService,
  rotationRemovalQueries,
  rotationSettingsService,
  type OpenedMediaDb,
} from '../../../db/index.js';
import { clearStatusCache } from '../../clients/arr/index.js';
import { rotationScheduler } from '../../cron/rotation-scheduler.js';
import { previewRemoval } from '../rotation-cycle.js';
import { pressureFrom } from '../rotation-removal-ranking.js';

const RADARR_URL = 'http://radarr.test:7878';
const GB = 1_073_741_824;

let tmpDir: string;
let opened: OpenedMediaDb;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

interface Fixture {
  radarrId: number;
  tmdbId: number;
  title: string;
  ageDays: number;
  sizeGb: number;
}

/**
 * Three movies far enough apart in age that the ranking's per-cycle tiebreak
 * never comes into play, and sized so the deficit takes exactly two of them.
 */
const LIBRARY: Fixture[] = [
  { radarrId: 1, tmdbId: 11, title: 'Ancient', ageDays: 900, sizeGb: 30 },
  { radarrId: 2, tmdbId: 22, title: 'Middling', ageDays: 400, sizeGb: 30 },
  { radarrId: 3, tmdbId: 33, title: 'Recent', ageDays: 120, sizeGb: 30 },
];

const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const json = (body: unknown): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    );
  if (url.includes('/diskspace')) {
    return json([{ path: '/movies', label: 'media', freeSpace: 50 * GB, totalSpace: 1000 * GB }]);
  }
  if (url.includes('/queue')) return json({ totalRecords: 0, records: [] });
  if (url.includes('/movie?tmdbId')) return json([]);
  if (url.includes('/movie')) {
    return json(
      LIBRARY.map((movie) => ({
        id: movie.radarrId,
        title: movie.title,
        tmdbId: movie.tmdbId,
        monitored: true,
        hasFile: true,
        sizeOnDisk: movie.sizeGb * GB,
        added: daysAgo(movie.ageDays),
      }))
    );
  }
  return json({});
});

function seed(): void {
  process.env['RADARR_URL'] = RADARR_URL;
  process.env['RADARR_API_KEY'] = 'radarr-key';
  process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
  process.env['RADARR_ROOT_FOLDER_PATH'] = '/movies';
  rotationSettingsService.setMany(opened.db, [
    { key: 'rotation_target_free_gb', value: '100' },
    { key: 'rotation_leaving_days', value: '7' },
    { key: 'rotation_daily_additions', value: '0' },
  ]);
  for (const movie of LIBRARY) {
    moviesService.createMovie(opened.db, { tmdbId: movie.tmdbId, title: movie.title });
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-removal-preview-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  clearStatusCache();
  seed();
});

afterEach(() => {
  rotationScheduler._reset();
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  clearStatusCache();
  for (const key of [
    'RADARR_URL',
    'RADARR_API_KEY',
    'RADARR_QUALITY_PROFILE_ID',
    'RADARR_ROOT_FOLDER_PATH',
  ]) {
    delete process.env[key];
  }
  vi.clearAllMocks();
});

describe('previewRemoval', () => {
  it('names the same movies a real cycle then marks', async () => {
    const preview = await previewRemoval(opened.db);

    await rotationScheduler.runOnce(opened.db);

    const marked = rotationRemovalQueries.getLeavingMovies(opened.db);
    expect(preview.plan?.toMark.map((m) => m.tmdbId)).toEqual(marked.map((m) => m.tmdbId));
    expect(preview.plan?.toMark.map((m) => m.title)).toEqual(['Ancient', 'Middling']);
  });

  it('leaves no trace of its own', async () => {
    await previewRemoval(opened.db);

    expect(rotationRemovalQueries.getLeavingMovies(opened.db)).toEqual([]);
    expect(rotationLogService.lastCycleLog(opened.db)).toBeNull();
    for (const movie of LIBRARY) {
      expect(moviesService.getMovieByTmdbId(opened.db, movie.tmdbId)?.rotationStatus).toBeNull();
    }
  });

  it('reports the deficit and how much of the library is actually removable', async () => {
    const preview = await previewRemoval(opened.db);

    expect(preview.skippedReason).toBeNull();
    expect(preview.plan?.deficitGb).toBe(50);
    expect(preview.plan?.eligibleCount).toBe(LIBRARY.length);
    expect(preview.plan?.removableCount).toBe(LIBRARY.length);
  });

  it('says why rather than guessing when Radarr is not configured', async () => {
    delete process.env['RADARR_URL'];
    clearStatusCache();

    const preview = await previewRemoval(opened.db);

    expect(preview.plan).toBeNull();
    expect(preview.skippedReason).toBe('Radarr not configured');
  });
});

describe('the persisted breakdown', () => {
  it('is enough to recompute the pressure of every marked movie', async () => {
    await rotationScheduler.runOnce(opened.db);

    const details = rotationLogService.lastCycleLog(opened.db)?.details;
    expect(details).not.toBeNull();
    const parsed = JSON.parse(details ?? '{}') as {
      marked: {
        title: string;
        pressure: number;
        ageDays: number;
        quality: number;
        keepWeight: number;
      }[];
    };

    expect(parsed.marked.length).toBe(2);
    for (const movie of parsed.marked) {
      expect(pressureFrom(movie)).toBeCloseTo(movie.pressure, 10);
    }
  });
});
