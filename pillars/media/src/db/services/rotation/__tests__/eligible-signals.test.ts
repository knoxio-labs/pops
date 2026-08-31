/**
 * The signals `getEligibleForRemoval` hands the ranking.
 *
 * A blacklisted watch is one the viewer disavowed — an accidental or mistaken
 * play — and every other taste consumer in the pillar ignores it. Counting it
 * here would both inflate the keep-weight and, worse, anchor the age clock to
 * it: a recent disavowed watch would put the movie inside the grace window and
 * score it at zero pressure, protecting it on the strength of a watch the rest
 * of the app has been told to ignore.
 *
 * Every fixture here is deliberately built so that a `watch_history` row's own
 * primary key can never equal the `media_id` it points at. An earlier version
 * of this file let them coincide, and the subqueries were correlating a movie
 * to `watch_history.id` rather than to `movies.id` — wrong against the real
 * library, and invisible against a fixture where the two lined up.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../../open-media-db.js';
import { mediaScores, watchHistory } from '../../../schema.js';
import { listDimensions } from '../../comparisons/dimensions.js';
import { createMovie } from '../../movies.js';
import { getEligibleForRemoval, type MovieSizeMap } from '../removal-queries.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 700_000;

/**
 * Push the `watch_history` and `media_scores` id sequences past the `movies`
 * one, so no row of either can accidentally satisfy a comparison against the
 * wrong table's key. `media_scores` is capped by its own unique index at one
 * row per (movie, dimension), so the ballast spans every dimension there.
 */
function offsetIdSequences(): void {
  const ballast = createMovie(opened.db, { tmdbId: ++tmdbSeq, title: 'Ballast' });
  for (let i = 0; i < 9; i++) {
    opened.db
      .insert(watchHistory)
      .values({
        mediaType: 'movie',
        mediaId: ballast.id,
        watchedAt: `2020-01-0${i + 1}T00:00:00.000Z`,
        completed: 1,
        blacklisted: 1,
      })
      .run();
  }
  for (const dimension of listDimensions(opened.db)) {
    opened.db
      .insert(mediaScores)
      .values({
        mediaType: 'movie',
        mediaId: ballast.id,
        dimensionId: dimension.id,
        score: 1500,
        comparisonCount: 0,
      })
      .run();
  }
}

/**
 * The fixture guarantee the correlation cases rest on. Asserted rather than
 * assumed: if a row's own id ever equals the movie it points at, a query
 * correlated to the wrong table answers correctly by accident and the case
 * stops testing anything.
 */
function expectNoIdCoincidence(movieIds: number[]): void {
  const ids = movieIds.join(',');
  for (const table of ['watch_history', 'media_scores']) {
    const row = opened.raw
      .prepare(`SELECT count(*) AS n FROM ${table} WHERE id = media_id AND media_id IN (${ids})`)
      .get() as { n: number };
    expect(row.n).toBe(0);
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-signals-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  offsetIdSequences();
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

describe('subquery correlation', () => {
  /**
   * The failure this pins is silent: the subqueries answered zero rather than
   * erroring, so the whole library read as never-watched and un-compared, and
   * the removal ranking lost both the keep curve and every Elo rating.
   */
  it('attributes a watch to the movie it belongs to, not to the row that records it', () => {
    const other = seed('Someone Else', [{ watchedAt: '2026-01-01T00:00:00.000Z' }]);
    const target = seed('The One Watched', [
      { watchedAt: '2026-02-01T00:00:00.000Z' },
      { watchedAt: '2026-03-01T00:00:00.000Z' },
    ]);
    const sizes: MovieSizeMap = new Map([...other.sizes, ...target.sizes]);

    expectNoIdCoincidence([other.id, target.id]);

    const all = getEligibleForRemoval(opened.db, sizes, new Set());
    expect(all.find((m) => m.id === target.id)?.watchCount).toBe(2);
    expect(all.find((m) => m.id === target.id)?.lastWatchedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(all.find((m) => m.id === other.id)?.watchCount).toBe(1);
  });

  it('attributes Elo comparisons to the movie they scored', () => {
    const other = seed('Uncompared', []);
    const target = seed('Compared', []);
    const [first, second] = listDimensions(opened.db);
    if (!first || !second) throw new Error('expected the default dimensions to exist');
    opened.db
      .insert(mediaScores)
      .values([
        {
          mediaType: 'movie',
          mediaId: target.id,
          dimensionId: first.id,
          score: 1600,
          comparisonCount: 7,
        },
        {
          mediaType: 'movie',
          mediaId: target.id,
          dimensionId: second.id,
          score: 1400,
          comparisonCount: 5,
        },
      ])
      .run();
    const sizes: MovieSizeMap = new Map([...other.sizes, ...target.sizes]);

    expectNoIdCoincidence([other.id, target.id]);

    const all = getEligibleForRemoval(opened.db, sizes, new Set());
    const scored = all.find((m) => m.id === target.id);
    expect(scored?.eloComparisons).toBe(12);
    expect(scored?.elo).toBe(1500);
    expect(all.find((m) => m.id === other.id)?.eloComparisons).toBe(0);
    expect(all.find((m) => m.id === other.id)?.elo).toBeNull();
  });
});
