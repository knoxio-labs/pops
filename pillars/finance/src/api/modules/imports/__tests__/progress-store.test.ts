/**
 * The durable progress store (POPS-2449): what a client sees across a
 * restart, when the table is written, and how expiry and the boot pass
 * behave. The idle TTL was a five-minute sliding window in a Map (#3619);
 * it is now a day on the row, still re-armed by every write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  freshMigratedFinanceDb,
  type MigratedFinanceDb,
} from '../../../../db/__tests__/migrated-db.js';
import { importSessionsService } from '../../../../db/index.js';
import {
  clearProgress,
  failInterruptedImportSessions,
  flushAllProgress,
  forgetProgressCache,
  getProgress,
  IMPORT_SESSION_IDLE_TTL_MS,
  INTERRUPTED_BY_RESTART,
  setProgress,
  sweepExpiredImportSessions,
  updateProgress,
  type ImportProgress,
} from '../progress-store.js';

const FLUSH_MS = 250;
const HOUR_MS = 60 * 60 * 1000;

function makeProgress(overrides: Partial<ImportProgress> = {}): ImportProgress {
  return {
    sessionId: 'session-1',
    status: 'processing',
    currentStep: 'matching',
    totalTransactions: 10,
    processedCount: 0,
    currentBatch: [],
    errors: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function storedPayload(db: MigratedFinanceDb['db'], sessionId: string): ImportProgress | undefined {
  const row = importSessionsService.readImportSession(db, sessionId);
  return row ? (JSON.parse(row.payload) as ImportProgress) : undefined;
}

let fx: MigratedFinanceDb;

beforeEach(() => {
  vi.useFakeTimers();
  fx = freshMigratedFinanceDb();
  clearProgress(fx.db);
});

afterEach(() => {
  forgetProgressCache();
  fx.raw.close();
  vi.useRealTimers();
});

describe('write-through', () => {
  it('setProgress writes the row at once', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    expect(storedPayload(fx.db, 'session-1')?.status).toBe('processing');
  });

  it('a progress-only update coalesces and lands after the flush delay', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    updateProgress(fx.db, 'session-1', { processedCount: 3 });
    updateProgress(fx.db, 'session-1', { processedCount: 5 });
    expect(storedPayload(fx.db, 'session-1')?.processedCount).toBe(0);
    expect(getProgress(fx.db, 'session-1')?.processedCount).toBe(5);

    vi.advanceTimersByTime(FLUSH_MS);
    expect(storedPayload(fx.db, 'session-1')?.processedCount).toBe(5);
  });

  it('a status change is written immediately, carrying the pending fields with it', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    updateProgress(fx.db, 'session-1', { processedCount: 9 });
    const result: ImportProgress['result'] = {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    };
    updateProgress(fx.db, 'session-1', { status: 'completed', processedCount: 10, result });

    const stored = storedPayload(fx.db, 'session-1');
    expect(stored?.status).toBe('completed');
    expect(stored?.processedCount).toBe(10);
    expect(stored?.result).toEqual(result);
  });

  it('flushAllProgress drains every pending timer', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    setProgress(fx.db, 'session-2', makeProgress({ sessionId: 'session-2' }));
    updateProgress(fx.db, 'session-1', { processedCount: 1 });
    updateProgress(fx.db, 'session-2', { processedCount: 2 });
    flushAllProgress(fx.db);
    expect(storedPayload(fx.db, 'session-1')?.processedCount).toBe(1);
    expect(storedPayload(fx.db, 'session-2')?.processedCount).toBe(2);
    vi.advanceTimersByTime(FLUSH_MS);
  });

  it('updateProgress on an unknown session writes nothing', () => {
    updateProgress(fx.db, 'missing', { processedCount: 1 });
    vi.advanceTimersByTime(FLUSH_MS);
    expect(getProgress(fx.db, 'missing')).toBeNull();
    expect(importSessionsService.readImportSession(fx.db, 'missing')).toBeUndefined();
  });
});

describe('across a restart', () => {
  it('a completed session is read back from the table when memory is empty', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    const result: ImportProgress['result'] = {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    };
    updateProgress(fx.db, 'session-1', { status: 'completed', processedCount: 10, result });

    forgetProgressCache();
    const progress = getProgress(fx.db, 'session-1');
    expect(progress?.status).toBe('completed');
    expect(progress?.result).toEqual(result);
  });

  it('a hydrated session takes further updates', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    forgetProgressCache();
    updateProgress(fx.db, 'session-1', { processedCount: 4 });
    expect(getProgress(fx.db, 'session-1')?.processedCount).toBe(4);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(storedPayload(fx.db, 'session-1')?.processedCount).toBe(4);
  });

  it('the boot pass fails a session that was still processing, and only that one', () => {
    setProgress(fx.db, 'session-1', makeProgress({ processedCount: 4 }));
    setProgress(fx.db, 'session-2', makeProgress({ sessionId: 'session-2', status: 'completed' }));
    forgetProgressCache();

    expect(failInterruptedImportSessions(fx.db)).toEqual(['session-1']);

    const failed = getProgress(fx.db, 'session-1');
    expect(failed?.status).toBe('failed');
    expect(failed?.processedCount).toBe(4);
    expect(failed?.errors).toEqual([{ description: 'System', error: INTERRUPTED_BY_RESTART }]);
    expect(getProgress(fx.db, 'session-2')?.status).toBe('completed');
    expect(failInterruptedImportSessions(fx.db)).toEqual([]);
  });
});

describe('expiry', () => {
  it('expires a session after a day of no activity', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS - HOUR_MS);
    expect(getProgress(fx.db, 'session-1')).not.toBeNull();
    forgetProgressCache();
    expect(getProgress(fx.db, 'session-1')).not.toBeNull();

    vi.advanceTimersByTime(HOUR_MS + 1);
    forgetProgressCache();
    expect(getProgress(fx.db, 'session-1')).toBeNull();
  });

  it('every write re-arms the expiry', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS - HOUR_MS);
    updateProgress(fx.db, 'session-1', { processedCount: 5 });
    vi.advanceTimersByTime(FLUSH_MS);

    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS - HOUR_MS);
    forgetProgressCache();
    expect(getProgress(fx.db, 'session-1')?.processedCount).toBe(5);
  });

  it('the sweep deletes lapsed rows and drops them from memory', () => {
    setProgress(fx.db, 'session-1', makeProgress());
    vi.advanceTimersByTime(HOUR_MS);
    setProgress(fx.db, 'session-2', makeProgress({ sessionId: 'session-2' }));
    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS - HOUR_MS + 1);

    expect(sweepExpiredImportSessions(fx.db)).toBe(1);
    expect(getProgress(fx.db, 'session-1')).toBeNull();
    expect(getProgress(fx.db, 'session-2')).not.toBeNull();
    expect(sweepExpiredImportSessions(fx.db)).toBe(0);
  });
});
