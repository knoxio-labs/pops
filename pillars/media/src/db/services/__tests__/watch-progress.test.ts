/**
 * The `watch_progress` mirror of Plex's in-progress state.
 *
 * Plex reports a `viewOffset` only while a title is unfinished and clears it on
 * completion, so this is a snapshot to be reconciled against each sync — not an
 * append-only log. These tests pin that: repeated observation updates rather
 * than accumulates, and anything a sync does not see is dropped.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../open-media-db.js';
import {
  clearProgress,
  listProgress,
  progressByMediaId,
  recordProgress,
  retainOnly,
} from '../watch-progress.js';

let tmpDir: string;
let opened: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-progress-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const HOUR_MS = 3_600_000;

function record(mediaId: number, offsetMs: number, durationMs: number | null = HOUR_MS): void {
  recordProgress(opened.db, { mediaType: 'movie', mediaId, viewOffsetMs: offsetMs, durationMs });
}

describe('recordProgress', () => {
  it('stores the fraction of the runtime reached', () => {
    record(1, HOUR_MS / 4);

    expect(listProgress(opened.db, 'movie')[0]?.progress).toBeCloseTo(0.25, 5);
  });

  it('updates in place rather than accumulating rows as a play advances', () => {
    record(1, HOUR_MS / 10);
    record(1, HOUR_MS / 2);

    const rows = listProgress(opened.db, 'movie');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.progress).toBeCloseTo(0.5, 5);
  });

  it('records the offset without a fraction when the duration is unusable', () => {
    // Still evidence of a play; a fabricated fraction would not be.
    record(1, 90_000, null);
    record(2, 90_000, 0);

    const byId = progressByMediaId(opened.db, 'movie', [1, 2]);
    expect(byId.get(1)).toBe(0);
    expect(byId.get(2)).toBe(0);
    expect(listProgress(opened.db, 'movie')[0]?.viewOffsetMs).toBe(90_000);
  });

  it('clamps an offset past the end of the runtime', () => {
    record(1, HOUR_MS * 3);

    expect(listProgress(opened.db, 'movie')[0]?.progress).toBe(1);
  });

  it('orders the listing furthest-through first', () => {
    record(1, HOUR_MS / 10);
    record(2, HOUR_MS * 0.8);
    record(3, HOUR_MS / 2);

    expect(listProgress(opened.db, 'movie').map((r) => r.mediaId)).toEqual([2, 3, 1]);
  });
});

describe('reconciliation', () => {
  it('drops a title the latest sync no longer sees in progress', () => {
    // Which is what happens when it is finished: Plex clears the offset, and a
    // completed watch must supersede the partial one.
    record(1, HOUR_MS / 2);
    record(2, HOUR_MS / 4);

    retainOnly(opened.db, 'movie', [2]);

    expect(listProgress(opened.db, 'movie').map((r) => r.mediaId)).toEqual([2]);
  });

  it('clears everything when a sync sees nothing in progress', () => {
    record(1, HOUR_MS / 2);

    retainOnly(opened.db, 'movie', []);

    expect(listProgress(opened.db, 'movie')).toEqual([]);
  });

  it('leaves another media type alone', () => {
    recordProgress(opened.db, {
      mediaType: 'episode',
      mediaId: 1,
      viewOffsetMs: HOUR_MS / 2,
      durationMs: HOUR_MS,
    });
    record(1, HOUR_MS / 2);

    retainOnly(opened.db, 'movie', []);

    expect(listProgress(opened.db, 'episode')).toHaveLength(1);
  });

  it('distinguishes the same media id across types', () => {
    recordProgress(opened.db, {
      mediaType: 'episode',
      mediaId: 7,
      viewOffsetMs: HOUR_MS / 4,
      durationMs: HOUR_MS,
    });
    record(7, HOUR_MS * 0.75);

    expect(progressByMediaId(opened.db, 'movie', [7]).get(7)).toBeCloseTo(0.75, 5);
    expect(progressByMediaId(opened.db, 'episode', [7]).get(7)).toBeCloseTo(0.25, 5);
  });

  it('forgets a single title', () => {
    record(1, HOUR_MS / 2);

    clearProgress(opened.db, 'movie', 1);

    expect(listProgress(opened.db, 'movie')).toEqual([]);
  });
});

describe('progressByMediaId', () => {
  it('omits titles with no unfinished play', () => {
    record(1, HOUR_MS / 2);

    const byId = progressByMediaId(opened.db, 'movie', [1, 2]);
    expect(byId.has(2)).toBe(false);
  });

  it('returns an empty map for an empty id list', () => {
    record(1, HOUR_MS / 2);

    expect(progressByMediaId(opened.db, 'movie', [])).toEqual(new Map());
  });
});
