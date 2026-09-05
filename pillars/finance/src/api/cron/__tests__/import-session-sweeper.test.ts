import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  freshMigratedFinanceDb,
  type MigratedFinanceDb,
} from '../../../db/__tests__/migrated-db.js';
import {
  clearProgress,
  forgetProgressCache,
  IMPORT_SESSION_IDLE_TTL_MS,
  setProgress,
} from '../../modules/imports/progress-store.js';
import { startImportSessionSweeper } from '../import-session-sweeper.js';

const HOUR_MS = 60 * 60 * 1000;

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

describe('startImportSessionSweeper', () => {
  it('sweeps on its interval, logs only when something went, and stops cleanly', () => {
    const info = vi.fn();
    setProgress(fx.db, 'old', {
      sessionId: 'old',
      status: 'completed',
      currentStep: 'matching',
      totalTransactions: 1,
      processedCount: 1,
      currentBatch: [],
      errors: [],
      startedAt: new Date().toISOString(),
    });
    const handle = startImportSessionSweeper({ db: fx.db, intervalMs: HOUR_MS, logger: { info } });

    vi.advanceTimersByTime(HOUR_MS);
    expect(info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('finance import-session sweep', { swept: 1 });

    handle.stop();
    info.mockClear();
    vi.advanceTimersByTime(IMPORT_SESSION_IDLE_TTL_MS);
    expect(info).not.toHaveBeenCalled();
  });
});
