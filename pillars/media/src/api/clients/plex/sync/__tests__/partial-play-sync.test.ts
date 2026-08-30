/**
 * Capturing unfinished plays from Plex.
 *
 * The movie watch sync used to open with `if (item.viewCount === 0) continue;`,
 * which is where every part-watched title went: `watch_history` held zero rows
 * with `completed = 0`, so "started it and stopped" — the strongest signal that
 * someone is done with a film — did not exist anywhere in the pillar
 * (POPS-2718).
 *
 * Verified against the live server on 2026-08-31: of 675 movies in the Plex
 * section, 152 were watched, 8 carried an unfinished play (2% to 79% through),
 * and only those 8 carried a `viewOffset` field at all.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { moviesService, watchProgressService } from '../../../../../db/index.js';
import { openMediaDb, type OpenedMediaDb } from '../../../../../db/open-media-db.js';
import { syncWatchHistoryFromPlex } from '../sync-watch-history.js';

import type { PlexClient } from '../../client.js';
import type { PlexMediaItem } from '../../types.js';

let tmpDir: string;
let opened: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-partial-play-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const HOUR_MS = 3_600_000;

function plexMovie(tmdbId: number, over: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: String(tmdbId),
    type: 'movie',
    title: `Movie ${tmdbId}`,
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2020,
    thumbUrl: null,
    artUrl: null,
    durationMs: HOUR_MS,
    addedAt: 0,
    updatedAt: 0,
    lastViewedAt: null,
    viewCount: 0,
    viewOffsetMs: null,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: [{ source: 'tmdb', id: String(tmdbId) }],
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...over,
  };
}

/** A Plex client that serves one movie section and no TV. */
function clientServing(items: PlexMediaItem[]): PlexClient {
  return { getAllItems: () => Promise.resolve(items) } as unknown as PlexClient;
}

function seedLibraryMovie(tmdbId: number): number {
  return moviesService.createMovie(opened.db, { tmdbId, title: `Movie ${tmdbId}` }).id;
}

const sync = (items: PlexMediaItem[]) =>
  syncWatchHistoryFromPlex(opened.db, clientServing(items), 'movies');

describe('unfinished plays', () => {
  it('records a part-watched movie the sync would otherwise have skipped', async () => {
    const movieId = seedLibraryMovie(101);

    const result = await sync([plexMovie(101, { viewOffsetMs: HOUR_MS * 0.4 })]);

    expect(result.movies?.partial).toBe(1);
    expect(
      watchProgressService.progressByMediaId(opened.db, 'movie', [movieId]).get(movieId)
    ).toBeCloseTo(0.4, 5);
  });

  it('leaves an untouched movie alone', async () => {
    const movieId = seedLibraryMovie(102);

    const result = await sync([plexMovie(102)]);

    expect(result.movies?.partial).toBe(0);
    expect(watchProgressService.progressByMediaId(opened.db, 'movie', [movieId]).size).toBe(0);
  });

  it('drops the unfinished play once the movie is finished', async () => {
    // Plex clears `viewOffset` on completion and moves the title to
    // viewCount >= 1; the partial record must not outlive that.
    const movieId = seedLibraryMovie(103);
    await sync([plexMovie(103, { viewOffsetMs: HOUR_MS * 0.9 })]);
    expect(watchProgressService.listProgress(opened.db, 'movie')).toHaveLength(1);

    await sync([plexMovie(103, { viewCount: 1, lastViewedAt: 1_700_000_000 })]);

    expect(watchProgressService.progressByMediaId(opened.db, 'movie', [movieId]).size).toBe(0);
  });

  it('follows the offset forward as the play advances, without duplicating it', async () => {
    const movieId = seedLibraryMovie(104);

    await sync([plexMovie(104, { viewOffsetMs: HOUR_MS * 0.1 })]);
    await sync([plexMovie(104, { viewOffsetMs: HOUR_MS * 0.6 })]);

    const rows = watchProgressService.listProgress(opened.db, 'movie');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mediaId).toBe(movieId);
    expect(rows[0]?.progress).toBeCloseTo(0.6, 5);
  });

  it('ignores a part-watched movie that is not in the local library', async () => {
    const result = await sync([plexMovie(999, { viewOffsetMs: HOUR_MS / 2 })]);

    expect(result.movies?.partial).toBe(0);
    expect(watchProgressService.listProgress(opened.db, 'movie')).toEqual([]);
  });

  it('keeps recording completed watches as before', async () => {
    seedLibraryMovie(105);

    const result = await sync([plexMovie(105, { viewCount: 2, lastViewedAt: 1_700_000_000 })]);

    expect(result.movies?.watched).toBe(1);
    expect(result.movies?.logged).toBe(1);
    expect(result.movies?.partial).toBe(0);
  });
});
