/**
 * The signals `getEligibleForRemoval` hands the ranking.
 *
 * A blacklisted watch is one the viewer disavowed — an accidental or mistaken
 * play — and every other taste consumer in the pillar ignores it. Counting it
 * here would both inflate the keep-weight and, worse, anchor the age clock to
 * it: a recent disavowed watch would put the movie inside the grace window and
 * score it at zero pressure, protecting it on the strength of a watch the rest
 * of the app has been told to ignore.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../../open-media-db.js';
import { watchHistory } from '../../../schema.js';
import { createMovie } from '../../movies.js';
import { getEligibleForRemoval, type MovieSizeMap } from '../removal-queries.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 700_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-signals-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface Watch {
  watchedAt: string;
  completed?: number;
  blacklisted?: number;
}

function seed(title: string, watches: Watch[]): { id: number; sizes: MovieSizeMap } {
  const tmdbId = ++tmdbSeq;
  const movie = createMovie(opened.db, { tmdbId, title });
  for (const watch of watches) {
    opened.db
      .insert(watchHistory)
      .values({
        mediaType: 'movie',
        mediaId: movie.id,
        watchedAt: watch.watchedAt,
        completed: watch.completed ?? 1,
        blacklisted: watch.blacklisted ?? 0,
      })
      .run();
  }
  return { id: movie.id, sizes: new Map([[tmdbId, 10]]) };
}

const signalsFor = (id: number, sizes: MovieSizeMap) =>
  getEligibleForRemoval(opened.db, sizes, new Set()).find((m) => m.id === id);

describe('watch signals', () => {
  it('counts a completed, non-blacklisted watch', () => {
    const movie = seed('Watched', [{ watchedAt: '2026-01-01T00:00:00.000Z' }]);

    const signals = signalsFor(movie.id, movie.sizes);
    expect(signals?.watchCount).toBe(1);
    expect(signals?.lastWatchedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('ignores a blacklisted watch entirely', () => {
    const movie = seed('Disavowed', [{ watchedAt: '2026-08-30T00:00:00.000Z', blacklisted: 1 }]);

    const signals = signalsFor(movie.id, movie.sizes);
    expect(signals?.watchCount).toBe(0);
    // Anchoring the age clock to it would score the movie at zero pressure.
    expect(signals?.lastWatchedAt).toBeNull();
  });

  it('ignores an incomplete watch', () => {
    const movie = seed('Abandoned', [{ watchedAt: '2026-08-30T00:00:00.000Z', completed: 0 }]);

    expect(signalsFor(movie.id, movie.sizes)?.watchCount).toBe(0);
  });

  it('keeps the real watches when only some are blacklisted', () => {
    const movie = seed('Mixed', [
      { watchedAt: '2026-01-01T00:00:00.000Z' },
      { watchedAt: '2026-08-30T00:00:00.000Z', blacklisted: 1 },
    ]);

    const signals = signalsFor(movie.id, movie.sizes);
    expect(signals?.watchCount).toBe(1);
    expect(signals?.lastWatchedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports no watch at all for an untouched movie', () => {
    const movie = seed('Untouched', []);

    const signals = signalsFor(movie.id, movie.sizes);
    expect(signals?.watchCount).toBe(0);
    expect(signals?.lastWatchedAt).toBeNull();
  });
});
