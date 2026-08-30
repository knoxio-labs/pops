/**
 * The protection half of the rotation lifecycle: what it takes for a
 * `protected` movie to actually be skipped by the removal phase, and what a
 * cancelled `leaving` movie does on the next cycle.
 *
 * `getEligibleForRemoval` skips a `protected` row only while its
 * `rotationExpiresAt` is in the future, so a protection written without an
 * expiry protects nothing at all — the case every test here pins down.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../../open-media-db.js';
import { movies } from '../../../schema.js';
import { setRotationStatus } from '../../movies-rotation.js';
import { createMovie } from '../../movies.js';
import {
  cancelLeaving,
  getEligibleForRemoval,
  markMoviesAsLeaving,
  type MovieSizeMap,
} from '../removal-queries.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 900_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-protection-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function iso(daysFromNow: number): string {
  const at = new Date();
  at.setDate(at.getDate() + daysFromNow);
  return at.toISOString();
}

/** A movie with a file on disk — the only kind the removal phase considers. */
function seedMovie(title: string): { id: number; tmdbId: number; sizes: MovieSizeMap } {
  const tmdbId = ++tmdbSeq;
  const row = createMovie(opened.db, { tmdbId, title });
  return { id: row.id, tmdbId, sizes: new Map([[tmdbId, 10]]) };
}

const eligibleIds = (sizes: MovieSizeMap): number[] =>
  getEligibleForRemoval(opened.db, sizes, new Set()).map((m) => m.id);

describe('protected movies and the removal phase', () => {
  it('excludes a movie protected with a future expiry', () => {
    const movie = seedMovie('Protected');
    setRotationStatus(opened.db, movie.id, 'protected', iso(30));

    expect(eligibleIds(movie.sizes)).not.toContain(movie.id);
  });

  it('includes a movie whose protection has lapsed', () => {
    const movie = seedMovie('Lapsed');
    setRotationStatus(opened.db, movie.id, 'protected', iso(-1));

    expect(eligibleIds(movie.sizes)).toContain(movie.id);
  });

  it('protects nothing when the status is written without an expiry', () => {
    const movie = seedMovie('Unbounded');
    setRotationStatus(opened.db, movie.id, 'protected', null);

    // Pins the defect the mandatory `expiresAt` parameter exists to prevent:
    // the filter reads a null expiry as "not currently protected".
    expect(eligibleIds(movie.sizes)).toContain(movie.id);
  });

  it('clears the expiry when the status is cleared', () => {
    const movie = seedMovie('Cleared');
    setRotationStatus(opened.db, movie.id, 'protected', iso(30));
    setRotationStatus(opened.db, movie.id, null, iso(30));

    const row = opened.db.select().from(movies).where(eq(movies.id, movie.id)).get();
    expect(row?.rotationStatus).toBeNull();
    expect(row?.rotationExpiresAt).toBeNull();
  });
});

describe('cancelLeaving', () => {
  it('keeps the movie out of the eligible set for the reprieve window', () => {
    const movie = seedMovie('Reprieved');
    markMoviesAsLeaving(opened.db, [movie.id], iso(7));

    expect(cancelLeaving(opened.db, movie.id, iso(30))).toBe(true);
    // Without the reprieve the movie returns to the eligible set at the rank it
    // already held, so the very next cycle marks it again.
    expect(eligibleIds(movie.sizes)).not.toContain(movie.id);
  });

  it('returns the movie to the eligible set when no reprieve is given', () => {
    const movie = seedMovie('Bare cancel');
    markMoviesAsLeaving(opened.db, [movie.id], iso(7));

    expect(cancelLeaving(opened.db, movie.id)).toBe(true);
    expect(eligibleIds(movie.sizes)).toContain(movie.id);
  });

  it('lets the reprieve lapse rather than protecting forever', () => {
    const movie = seedMovie('Lapsing reprieve');
    markMoviesAsLeaving(opened.db, [movie.id], iso(7));
    cancelLeaving(opened.db, movie.id, iso(-1));

    expect(eligibleIds(movie.sizes)).toContain(movie.id);
  });

  it('is a no-op for a movie that is not leaving', () => {
    const movie = seedMovie('Untouched');

    expect(cancelLeaving(opened.db, movie.id, iso(30))).toBe(false);
    const row = opened.db.select().from(movies).where(eq(movies.id, movie.id)).get();
    expect(row?.rotationStatus).toBeNull();
    expect(row?.rotationExpiresAt).toBeNull();
  });

  it('is a no-op for a movie that does not exist', () => {
    expect(cancelLeaving(opened.db, 987_654, iso(30))).toBe(false);
  });
});
