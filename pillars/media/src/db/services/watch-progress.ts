/**
 * Unfinished plays — the `watch_progress` mirror of Plex's in-progress state.
 *
 * HTTP-free; `(db, …)`-arg. Upsert-by-media rather than append: Plex reports an
 * offset for an item only while it is unfinished, and clears it once the title
 * completes, so this table is a snapshot of what is currently part-watched and
 * not a log of what once was.
 */
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { watchProgress } from '../schema.js';

import type { MediaDb } from './internal.js';

export type WatchProgressRow = typeof watchProgress.$inferSelect;

export type ProgressMediaType = 'movie' | 'episode';

/**
 * Format a JS Date as the second-precision UTC string SQLite returns from
 * `datetime('now')` — `YYYY-MM-DD HH:MM:SS`. The column's own default is that
 * expression, so a raw `toISOString()` would store a differently-shaped string
 * that sorts and compares inconsistently against it.
 */
function nowSqliteDatetime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export interface RecordProgressInput {
  mediaType: ProgressMediaType;
  mediaId: number;
  viewOffsetMs: number;
  durationMs: number | null;
}

/**
 * Record (or refresh) how far into a title a viewer got.
 *
 * `progress` is clamped to [0, 1]; a missing or nonsensical duration yields 0
 * rather than a division by zero, so the offset is still recorded and the
 * consumer can see there was a play without being told a fraction that is not
 * real.
 */
export function recordProgress(db: MediaDb, input: RecordProgressInput): void {
  const { durationMs, viewOffsetMs } = input;
  const progress =
    durationMs && durationMs > 0 ? Math.min(1, Math.max(0, viewOffsetMs / durationMs)) : 0;

  db.insert(watchProgress)
    .values({
      mediaType: input.mediaType,
      mediaId: input.mediaId,
      progress,
      viewOffsetMs,
      durationMs: durationMs ?? null,
      observedAt: nowSqliteDatetime(),
    })
    .onConflictDoUpdate({
      target: [watchProgress.mediaType, watchProgress.mediaId],
      set: {
        progress,
        viewOffsetMs,
        durationMs: durationMs ?? null,
        observedAt: nowSqliteDatetime(),
      },
    })
    .run();
}

/**
 * Forget a title's unfinished play.
 *
 * Called when Plex stops reporting an offset for it — because it was finished,
 * or the progress was cleared. A completed watch supersedes a partial one, so
 * leaving the row would report a title as part-watched forever.
 */
export function clearProgress(db: MediaDb, mediaType: ProgressMediaType, mediaId: number): void {
  db.delete(watchProgress)
    .where(and(eq(watchProgress.mediaType, mediaType), eq(watchProgress.mediaId, mediaId)))
    .run();
}

/**
 * Drop every unfinished play for `mediaType` except those whose media id is in
 * `keep`, in one statement.
 *
 * A sync sees the whole section at once, so anything it did not observe as
 * in-progress no longer is.
 */
export function retainOnly(
  db: MediaDb,
  mediaType: ProgressMediaType,
  keep: readonly number[]
): void {
  const base = eq(watchProgress.mediaType, mediaType);
  db.delete(watchProgress)
    .where(keep.length === 0 ? base : and(base, notInArray(watchProgress.mediaId, [...keep])))
    .run();
}

/** Every unfinished play for a media type, furthest-through first. */
export function listProgress(db: MediaDb, mediaType: ProgressMediaType): WatchProgressRow[] {
  return db
    .select()
    .from(watchProgress)
    .where(eq(watchProgress.mediaType, mediaType))
    .orderBy(desc(watchProgress.progress))
    .all();
}

/** Media id → progress fraction, for the media ids given. */
export function progressByMediaId(
  db: MediaDb,
  mediaType: ProgressMediaType,
  mediaIds: readonly number[]
): Map<number, number> {
  if (mediaIds.length === 0) return new Map();
  const rows = db
    .select({ mediaId: watchProgress.mediaId, progress: watchProgress.progress })
    .from(watchProgress)
    .where(and(eq(watchProgress.mediaType, mediaType), inArray(watchProgress.mediaId, mediaIds)))
    .all();
  return new Map(rows.map((r) => [r.mediaId, r.progress]));
}
