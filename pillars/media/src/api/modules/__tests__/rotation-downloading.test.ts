/**
 * The rotation engine excludes downloading titles from removal, and once a
 * movie's leaving window expires it deletes the file. `/queue` is paged and
 * defaults to ten records, so reading one page made that exclusion a claim
 * about the first ten downloads — and the movie past them was deleted mid
 * re-download (POPS-2703).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  moviesService,
  openMediaDb,
  rotationRemovalQueries,
  type OpenedMediaDb,
} from '../../../db/index.js';
import { RadarrClient } from '../../clients/arr/radarr-client.js';
import { getDownloadingTmdbIds, processExpiredMovies } from '../rotation-removal.js';

const BASE = 'http://radarr.test';

/** One queue record per movie id, served in pages the way Radarr serves them. */
function serveRadarr(queueMovieIds: number[], movies: Array<{ id: number; tmdbId: number }>) {
  return vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/queue')) {
      const params = new URL(url).searchParams;
      const page = Number(params.get('page') ?? '1');
      const pageSize = Number(params.get('pageSize') ?? '10');
      const start = (page - 1) * pageSize;
      const slice = queueMovieIds.slice(start, start + pageSize);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            totalRecords: queueMovieIds.length,
            records: slice.map((movieId, i) => ({ id: start + i, movieId })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(movies), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDownloadingTmdbIds', () => {
  it('sees a movie downloading past the first page of the queue', async () => {
    const queueMovieIds = Array.from({ length: 250 }, (_, i) => i + 1);
    const movies = queueMovieIds.map((id) => ({ id, tmdbId: id * 10 }));
    vi.stubGlobal('fetch', serveRadarr(queueMovieIds, movies));

    const downloading = await getDownloadingTmdbIds(new RadarrClient(BASE, 'key'));

    expect(downloading.size).toBe(250);
    // Position 240 in the queue — invisible to a single default-sized page.
    expect(downloading.has(2400)).toBe(true);
  });

  it('reports nothing downloading when the queue is empty', async () => {
    vi.stubGlobal('fetch', serveRadarr([], [{ id: 1, tmdbId: 10 }]));

    const downloading = await getDownloadingTmdbIds(new RadarrClient(BASE, 'key'));

    expect(downloading.size).toBe(0);
  });

  it('ignores a queue record whose movie Radarr no longer lists', async () => {
    vi.stubGlobal('fetch', serveRadarr([1, 99], [{ id: 1, tmdbId: 10 }]));

    const downloading = await getDownloadingTmdbIds(new RadarrClient(BASE, 'key'));

    expect([...downloading]).toEqual([10]);
  });
});

describe('processExpiredMovies', () => {
  function dbWithExpiredMovie(): { opened: OpenedMediaDb; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'media-rotation-expired-'));
    const opened = openMediaDb(join(dir, 'media.db'));
    const movie = moviesService.createMovie(opened.db, { tmdbId: 77, title: 'Past Due' });
    rotationRemovalQueries.markMoviesAsLeaving(
      opened.db,
      [movie.id],
      new Date(Date.now() - 86_400_000).toISOString()
    );
    return { opened, dir };
  }

  it('deletes nothing when the queue cannot be read', async () => {
    const { opened, dir } = dbWithExpiredMovie();
    const deleteCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if ((init?.method ?? 'GET').toUpperCase() === 'DELETE') deleteCalls.push(url);
        if (url.includes('/queue')) {
          return Promise.resolve(new Response('upstream down', { status: 503 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 5, tmdbId: 77, title: 'Past Due' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
      })
    );

    try {
      const outcome = await processExpiredMovies(opened.db, new RadarrClient(BASE, 'key'));

      expect(outcome.removed).toEqual([]);
      expect(outcome.failed.map((f) => f.tmdbId)).toEqual([77]);
      expect(deleteCalls).toEqual([]);
      expect(rotationRemovalQueries.getLeavingMovies(opened.db)).toHaveLength(1);
    } finally {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never reads the queue when nothing has expired', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-rotation-expired-'));
    const opened = openMediaDb(join(dir, 'media.db'));
    const fetchMock = vi.fn(() => Promise.reject(new Error('no upstream call expected')));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const outcome = await processExpiredMovies(opened.db, new RadarrClient(BASE, 'key'));

      expect(outcome).toEqual({ removed: [], failed: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
