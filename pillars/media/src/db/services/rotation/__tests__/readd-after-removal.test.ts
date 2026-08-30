/**
 * Rotation is a revolving door. These tests pin the two mechanisms that made it
 * one-way (POPS-2720): a candidate row left at `added` that the unique index
 * then blocks every later insert against, and a "already in the library" check
 * that matched a `movies` row rather than a file on disk — while the row is
 * deliberately kept after the file is deleted, so its Elo and watch history
 * survive.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../../open-media-db.js';
import { rotationCandidates } from '../../../schema.js';
import { createMovie } from '../../movies.js';
import { markCandidateAdded } from '../candidate-sync.js';
import { addToQueue, forgetCandidate } from '../candidates.js';
import { aggregateCandidates } from '../selection-policy.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 800_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-readd-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const NOTHING_ON_DISK: ReadonlySet<number> = new Set();

function candidateStatus(tmdbId: number): string | undefined {
  return opened.db
    .select({ status: rotationCandidates.status })
    .from(rotationCandidates)
    .where(eq(rotationCandidates.tmdbId, tmdbId))
    .get()?.status;
}

/** Queue a movie, download it (candidate `added`, library row created). */
function queueAndDownload(title: string): number {
  const tmdbId = ++tmdbSeq;
  addToQueue(opened.db, { tmdbId, title });
  const row = opened.db
    .select({ id: rotationCandidates.id })
    .from(rotationCandidates)
    .where(eq(rotationCandidates.tmdbId, tmdbId))
    .get();
  markCandidateAdded(opened.db, row?.id ?? 0);
  createMovie(opened.db, { tmdbId, title });
  return tmdbId;
}

describe('addToQueue', () => {
  it('reports that it queued nothing when a row already exists', () => {
    const tmdbId = queueAndDownload('Interstellar');

    // The unique index swallows the insert; the caller must be told.
    expect(addToQueue(opened.db, { tmdbId, title: 'Interstellar' })).toBe(false);
    expect(candidateStatus(tmdbId)).toBe('added');
  });

  it('reports a genuine insert', () => {
    expect(addToQueue(opened.db, { tmdbId: ++tmdbSeq, title: 'Fresh' })).toBe(true);
  });
});

describe('after rotation removes the file', () => {
  it('lets the movie be queued again', () => {
    const tmdbId = queueAndDownload('Gone');
    expect(addToQueue(opened.db, { tmdbId, title: 'Gone' })).toBe(false);

    forgetCandidate(opened.db, tmdbId);

    expect(addToQueue(opened.db, { tmdbId, title: 'Gone' })).toBe(true);
    expect(candidateStatus(tmdbId)).toBe('pending');
  });

  it('lets the addition phase select it even though its library row survives', () => {
    const tmdbId = queueAndDownload('Rotated out');
    forgetCandidate(opened.db, tmdbId);
    addToQueue(opened.db, { tmdbId, title: 'Rotated out' });

    // The `movies` row is still there on purpose — Elo, watch history and tier
    // overrides hang off it. Only the file is gone.
    const selected = aggregateCandidates(opened.db, 5, NOTHING_ON_DISK);
    expect(selected.map((c) => c.tmdbId)).toContain(tmdbId);
  });

  it('does not re-queue the movie by itself', () => {
    // Forgetting restores eligibility; it must not push the movie back into the
    // pool, or the engine would immediately re-download what it just deleted.
    const tmdbId = queueAndDownload('Not resurrected');

    forgetCandidate(opened.db, tmdbId);

    expect(candidateStatus(tmdbId)).toBeUndefined();
    expect(aggregateCandidates(opened.db, 5, NOTHING_ON_DISK)).toEqual([]);
  });
});

describe('aggregateCandidates', () => {
  it('skips a movie that still holds a file on disk', () => {
    const tmdbId = ++tmdbSeq;
    addToQueue(opened.db, { tmdbId, title: 'Already here' });
    createMovie(opened.db, { tmdbId, title: 'Already here' });

    expect(aggregateCandidates(opened.db, 5, new Set([tmdbId]))).toEqual([]);
  });

  it('selects a movie whose library row exists but holds no file', () => {
    const tmdbId = ++tmdbSeq;
    addToQueue(opened.db, { tmdbId, title: 'Row only' });
    createMovie(opened.db, { tmdbId, title: 'Row only' });

    const selected = aggregateCandidates(opened.db, 5, NOTHING_ON_DISK);
    expect(selected.map((c) => c.tmdbId)).toEqual([tmdbId]);
  });
});
