/**
 * Hourly sweep of lapsed import sessions (POPS-2449).
 *
 * The session table is bounded by expiry, not by size: every row carries the
 * instant it stops being readable, and this worker deletes what is past it.
 * A read already treats an expired row as absent, so the sweep is hygiene,
 * not correctness — which is why it runs on a long interval, never at boot,
 * and never blocks a request.
 *
 * Same shape as the other finance workers: a recursive `setTimeout` armed
 * again only after the pass returns, synchronous `runOnce` for tests.
 */
import { sweepExpiredImportSessions } from '../modules/imports/progress-store.js';

import type { FinanceDb } from '../../db/index.js';

const HOUR_MS = 60 * 60 * 1000;

export interface ImportSessionSweeperOptions {
  db: FinanceDb;
  intervalMs?: number;
  logger?: { info?: (msg: string, meta?: Record<string, unknown>) => void };
}

export interface ImportSessionSweeperHandle {
  stop: () => void;
  /** One pass now; returns how many rows went. */
  runOnce: () => number;
}

export function startImportSessionSweeper(
  options: ImportSessionSweeperOptions
): ImportSessionSweeperHandle {
  const intervalMs = options.intervalMs ?? HOUR_MS;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function runOnce(): number {
    const swept = sweepExpiredImportSessions(options.db);
    if (swept > 0) options.logger?.info?.('finance import-session sweep', { swept });
    return swept;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      runOnce();
      arm();
    }, intervalMs);
    timer.unref?.();
  }

  arm();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    runOnce,
  };
}
