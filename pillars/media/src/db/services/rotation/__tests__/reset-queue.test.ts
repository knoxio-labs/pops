/**
 * `resetLeavingQueue` — the "start the queue over" button behind the rotation
 * tuning panel.
 *
 * Two things distinguish it from cancelling films one at a time, and both are
 * pinned here: it must clear every `leaving` mark rather than the expired ones
 * only, and it must NOT grant the protection reprieve a manual cancel does.
 * The reprieve exists so an operator does not have to fight the same title
 * every night; a bulk reset is the operator saying "rank the whole library
 * again", so leaving films protected would defeat the reset.
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
  resetLeavingQueue,
  type MovieSizeMap,
} from '../removal-queries.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 700_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-reset-queue-test-'));
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

function seedMovie(title: string): { id: number; tmdbId: number } {
  const tmdbId = ++tmdbSeq;
  const row = createMovie(opened.db, { tmdbId, title });
  return { id: row.id, tmdbId };
}

function rowFor(id: number) {
  const [row] = opened.db.select().from(movies).where(eq(movies.id, id)).all();
  if (!row) throw new Error(`movie ${id} vanished`);
  return row;
}

describe('resetLeavingQueue', () => {
  it('clears every leaving mark and reports how many it cleared', () => {
    const expired = seedMovie('Expired');
    const pending = seedMovie('Pending');
    setRotationStatus(opened.db, expired.id, 'leaving', iso(-2));
    setRotationStatus(opened.db, pending.id, 'leaving', iso(5));

    expect(resetLeavingQueue(opened.db)).toBe(2);
    expect(rowFor(expired.id).rotationStatus).toBeNull();
    expect(rowFor(pending.id).rotationStatus).toBeNull();
  });

  it('leaves no expiry or mark timestamp behind', () => {
    const movie = seedMovie('Marked');
    setRotationStatus(opened.db, movie.id, 'leaving', iso(5));
    expect(rowFor(movie.id).rotationMarkedAt).not.toBeNull();

    resetLeavingQueue(opened.db);

    const row = rowFor(movie.id);
    expect(row.rotationExpiresAt).toBeNull();
    expect(row.rotationMarkedAt).toBeNull();
  });

  it('does NOT protect what it un-marks — unlike cancelling one film', () => {
    const bulk = seedMovie('Reset in bulk');
    const cancelled = seedMovie('Cancelled by hand');
    setRotationStatus(opened.db, bulk.id, 'leaving', iso(5));
    setRotationStatus(opened.db, cancelled.id, 'leaving', iso(5));

    cancelLeaving(opened.db, cancelled.id, iso(30));
    resetLeavingQueue(opened.db);

    expect(rowFor(bulk.id).rotationStatus).toBeNull();
    expect(rowFor(cancelled.id).rotationStatus).toBe('protected');

    const sizes: MovieSizeMap = new Map([
      [bulk.tmdbId, 10],
      [cancelled.tmdbId, 10],
    ]);
    const eligible = getEligibleForRemoval(opened.db, sizes, new Set()).map((m) => m.id);
    expect(eligible).toContain(bulk.id);
    expect(eligible).not.toContain(cancelled.id);
  });

  it('does not touch a protected film it never marked', () => {
    const movie = seedMovie('Protected');
    setRotationStatus(opened.db, movie.id, 'protected', iso(30));

    expect(resetLeavingQueue(opened.db)).toBe(0);
    expect(rowFor(movie.id).rotationStatus).toBe('protected');
    expect(rowFor(movie.id).rotationExpiresAt).not.toBeNull();
  });

  it('is a no-op on an empty queue', () => {
    seedMovie('Untouched');
    expect(resetLeavingQueue(opened.db)).toBe(0);
  });
});
