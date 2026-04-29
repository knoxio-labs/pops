import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { debriefResults, debriefSessions, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { WatchHistoryFilters, WatchHistoryRow } from '../types.js';

export { listRecent, type RecentWatchHistoryListResult } from './list-recent.js';
export { getBatchProgress, getProgress } from './progress.js';

export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

export function listWatchHistory(
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];
  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as 'movie' | 'episode'));
  }
  if (filters.mediaId) conditions.push(eq(watchHistory.mediaId, filters.mediaId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();
  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();
  return { rows, total: countRow?.total ?? 0 };
}

export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();
  if (!row) throw new NotFoundError('WatchHistoryEntry', String(id));
  return row;
}

export function deleteWatchHistoryEntry(id: number): void {
  // Verify the entry exists before attempting deletion (throws NotFoundError if missing).
  getWatchHistoryEntry(id);

  getDrizzle().transaction((tx) => {
    // Cascade: delete debrief_results rows that belong to sessions referencing this entry.
    const sessionIds = tx
      .select({ id: debriefSessions.id })
      .from(debriefSessions)
      .where(eq(debriefSessions.watchHistoryId, id))
      .all()
      .map((r) => r.id);

    if (sessionIds.length > 0) {
      tx.delete(debriefResults).where(inArray(debriefResults.sessionId, sessionIds)).run();
    }

    // Cascade: delete debrief_sessions rows referencing this watch_history entry.
    tx.delete(debriefSessions).where(eq(debriefSessions.watchHistoryId, id)).run();

    // Now safe to delete the watch_history row.
    const result = tx.delete(watchHistory).where(eq(watchHistory.id, id)).run();
    if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
  });
}
