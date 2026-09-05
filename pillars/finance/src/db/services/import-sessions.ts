/**
 * Data access for `import_sessions` (POPS-2449): the wizard's processing
 * session, kept across restarts.
 *
 * This layer knows nothing about the progress shape beyond its `status` and
 * `sessionId` — it stores what it is given as JSON and hands it back. The
 * cache, coalescing and expiry policy live in the import module's
 * `progress-store`; here are only the writes and reads those need.
 */
import { and, eq, lt } from 'drizzle-orm';

import { importSessions } from '../schema.js';

import type { FinanceDb } from './internal.js';

export type ImportSessionStatus = 'processing' | 'completed' | 'failed';

export interface StoredImportSession {
  sessionId: string;
  status: ImportSessionStatus;
  payload: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface UpsertImportSessionInput {
  sessionId: string;
  status: ImportSessionStatus;
  payload: string;
  startedAt: string;
  /** ISO instant; the row reads as gone past it even before the sweep deletes it. */
  expiresAt: string;
  updatedAt?: string;
}

export function upsertImportSession(db: FinanceDb, input: UpsertImportSessionInput): void {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  db.insert(importSessions)
    .values({ ...input, updatedAt })
    .onConflictDoUpdate({
      target: importSessions.sessionId,
      set: {
        status: input.status,
        payload: input.payload,
        updatedAt,
        expiresAt: input.expiresAt,
      },
    })
    .run();
}

/** The stored session, or undefined when unknown or already past its expiry as of `now`. */
export function readImportSession(
  db: FinanceDb,
  sessionId: string,
  now: string = new Date().toISOString()
): StoredImportSession | undefined {
  const row = db.select().from(importSessions).where(eq(importSessions.sessionId, sessionId)).get();
  if (row === undefined || row.expiresAt <= now) return undefined;
  return row;
}

/** Delete every session past its expiry; returns how many went. */
export function deleteExpiredImportSessions(
  db: FinanceDb,
  now: string = new Date().toISOString()
): number {
  return db.delete(importSessions).where(lt(importSessions.expiresAt, now)).run().changes;
}

/**
 * The sessions a restart caught mid-processing, with the failure written into
 * their payload by `fail`. Returns the ids so the caller can log them.
 */
export function failInterruptedImportSessions(
  db: FinanceDb,
  fail: (payload: string) => string
): string[] {
  const rows = db
    .select()
    .from(importSessions)
    .where(and(eq(importSessions.status, 'processing')))
    .all();
  const updatedAt = new Date().toISOString();
  for (const row of rows) {
    db.update(importSessions)
      .set({ status: 'failed', payload: fail(row.payload), updatedAt })
      .where(eq(importSessions.sessionId, row.sessionId))
      .run();
  }
  return rows.map((row) => row.sessionId);
}

export function deleteAllImportSessions(db: FinanceDb): void {
  db.delete(importSessions).run();
}
