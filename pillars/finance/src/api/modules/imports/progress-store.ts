/**
 * Progress tracking for import sessions, durable across a restart
 * (POPS-2449).
 *
 * The process loop reports progress far too often to hit SQLite on every
 * call — once per row in its bookkeeping pass — so the live copy stays in
 * memory and is written through in coalesced flushes: a dirty session is
 * flushed a quarter of a second after its first unflushed write, and at once
 * when its status changes, which is the write a reconnecting client cannot do
 * without. A session unknown to memory is read back from the table, which is
 * how the wizard finds its run again after a deploy.
 *
 * Expiry is idle-based and generous: a day since the last write, re-armed by
 * every write, stored on the row and checked on read, so a session that
 * lapsed while the pillar was down reads as gone before any sweep runs. The
 * old five-minute window bounded a process-local Map; a table is bounded by
 * `sweepExpiredImportSessions` instead, and the day is what lets a person
 * come back to a finished result after the deploy that interrupted them.
 *
 * A restart cannot resume a pass that was mid-flight — the work lived in the
 * process — so `failInterruptedImportSessions` runs at boot and marks those
 * sessions failed with a message the client's recovery path already knows
 * how to act on. A completed session, result and all, is untouched.
 */
import { importSessionsService, type FinanceDb } from '../../../db/index.js';

import type { ProcessImportOutput } from './types.js';

export interface ImportProgress {
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  currentStep: 'deduplicating' | 'matching' | 'categorizing';
  totalTransactions: number;
  processedCount: number;
  currentBatch: Array<{
    description: string;
    status: 'processing' | 'success' | 'failed';
    error?: string;
  }>;
  errors: Array<{ description: string; error: string }>;
  startedAt: string;
  result?: ProcessImportOutput;
}

export const IMPORT_SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 250;
export const INTERRUPTED_BY_RESTART =
  'The import was interrupted by a restart of the finance service; start it again to continue.';

const cache = new Map<string, ImportProgress>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function expiresAt(now = Date.now()): string {
  return new Date(now + IMPORT_SESSION_IDLE_TTL_MS).toISOString();
}

function flush(db: FinanceDb, sessionId: string): void {
  const timer = flushTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(sessionId);
  }
  const progress = cache.get(sessionId);
  if (!progress) return;
  importSessionsService.upsertImportSession(db, {
    sessionId,
    status: progress.status,
    payload: JSON.stringify(progress),
    startedAt: progress.startedAt,
    expiresAt: expiresAt(),
  });
}

function scheduleFlush(db: FinanceDb, sessionId: string): void {
  if (flushTimers.has(sessionId)) return;
  const timer = setTimeout(() => {
    try {
      flush(db, sessionId);
    } catch (error) {
      console.warn('[finance-api] import session flush failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, FLUSH_DELAY_MS);
  timer.unref?.();
  flushTimers.set(sessionId, timer);
}

/** Store a session and write it through at once. */
export function setProgress(db: FinanceDb, sessionId: string, progress: ImportProgress): void {
  cache.set(sessionId, progress);
  flush(db, sessionId);
}

/** The session as it stands, from memory or, after a restart, from the table. Null when unknown or expired. */
export function getProgress(db: FinanceDb, sessionId: string): ImportProgress | null {
  const cached = cache.get(sessionId);
  if (cached) return cached;
  const stored = importSessionsService.readImportSession(db, sessionId);
  if (stored === undefined) return null;
  const progress = JSON.parse(stored.payload) as ImportProgress;
  cache.set(sessionId, progress);
  return progress;
}

/**
 * Merge partial updates into a known session. A status change is written
 * through immediately; anything else rides the next coalesced flush. No-op
 * for a session that is gone.
 */
export function updateProgress(
  db: FinanceDb,
  sessionId: string,
  updates: Partial<ImportProgress>
): void {
  const current = getProgress(db, sessionId);
  if (!current) return;
  const next = { ...current, ...updates };
  cache.set(sessionId, next);
  if (updates.status !== undefined && updates.status !== current.status) flush(db, sessionId);
  else scheduleFlush(db, sessionId);
}

/** Write every pending flush now; the shutdown path calls this before the db closes. */
export function flushAllProgress(db: FinanceDb): void {
  for (const sessionId of [...flushTimers.keys()]) flush(db, sessionId);
}

/** Boot pass: sessions a restart caught mid-processing become failed, with a message the client acts on. */
export function failInterruptedImportSessions(db: FinanceDb): string[] {
  return importSessionsService.failInterruptedImportSessions(db, (payload) => {
    const progress = JSON.parse(payload) as ImportProgress;
    return JSON.stringify({
      ...progress,
      status: 'failed',
      errors: [...progress.errors, { description: 'System', error: INTERRUPTED_BY_RESTART }],
    });
  });
}

/** Delete lapsed rows; returns how many. Memory forgets them too, so a stale cache cannot resurrect one. */
export function sweepExpiredImportSessions(db: FinanceDb): number {
  const swept = importSessionsService.deleteExpiredImportSessions(db);
  for (const [sessionId] of cache) {
    if (importSessionsService.readImportSession(db, sessionId) === undefined) {
      cache.delete(sessionId);
    }
  }
  return swept;
}

/** Forget every session in memory AND in the table (tests). */
export function clearProgress(db: FinanceDb): void {
  forgetProgressCache();
  importSessionsService.deleteAllImportSessions(db);
}

/** Forget the in-memory copy only — what a restart does (tests). */
export function forgetProgressCache(): void {
  for (const timer of flushTimers.values()) clearTimeout(timer);
  flushTimers.clear();
  cache.clear();
}
