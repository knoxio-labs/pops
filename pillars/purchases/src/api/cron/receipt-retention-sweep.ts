/**
 * Periodic worker for the receipt retention sweep (POPS-3757).
 *
 * Mirrors `reconcile-cross-pillar.ts`'s shape: a recursive `setTimeout` arms
 * the next tick only after the current one settles, so a slow pass cannot
 * pile up overlapping runs, and the worker is trivial to drive with
 * `vi.useFakeTimers()`.
 *
 * A receipt is only ever eligible for deletion once per 48h retention
 * window, so ticking more often than every few hours buys nothing — this
 * defaults to 6 hours, far more frequent than the reconcile cron's 24h
 * default, because a receipt sitting past its window is exactly the failure
 * mode this worker exists to bound.
 */
import {
  DEFAULT_RECEIPT_RETENTION_MS,
  sweepUnreferencedReceipts,
  type SweepUnreferencedReceiptsOptions,
} from '../../ingest/receipt/retention-sweep.js';

import type { PurchasesDb } from '../../db/index.js';
import type { SweepUnreferencedReceiptsResult } from '../../ingest/receipt/retention-sweep.js';

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Receives completed-pass counts and sweep failures. */
export interface ReceiptRetentionSweepLogger {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * The sweep call this worker drives.
 *
 * `sweepUnreferencedReceipts` itself is synchronous — this is widened to
 * also allow a `Promise`, purely so a test can stand in a stubbed pass that
 * settles on its own schedule and prove `drain()` genuinely waits for it,
 * without the worker's production path ever depending on that.
 */
type ReceiptSweepFn = (
  db: PurchasesDb,
  options: SweepUnreferencedReceiptsOptions
) => SweepUnreferencedReceiptsResult | Promise<SweepUnreferencedReceiptsResult>;

/** Configures the worker database, retention policy, scheduling and sweep implementation. */
export interface ReceiptRetentionSweepWorkerOptions {
  db: PurchasesDb;
  root?: string;
  retentionMs?: number;
  intervalMs?: number;
  logger?: ReceiptRetentionSweepLogger;
  now?: () => Date;
  /** Test-only seam. Defaults to {@link sweepUnreferencedReceipts}. */
  sweep?: ReceiptSweepFn;
}

/** Controls scheduled sweeps and joins any pass already running. */
export interface ReceiptRetentionSweepWorkerHandle {
  /** Cancel the next scheduled tick. Call this BEFORE `drain()`. */
  stop: () => void;
  /** Run one pass and return its stats, joining a pass already in flight. */
  runOnce: () => Promise<SweepUnreferencedReceiptsResult>;
  /** Settle any in-flight pass. Always call `stop()` first. */
  drain: () => Promise<void>;
}

/** Starts a sweep immediately, then schedules non-overlapping passes until stopped. */
export function startReceiptRetentionSweepWorker(
  options: ReceiptRetentionSweepWorkerOptions
): ReceiptRetentionSweepWorkerHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const retentionMs = options.retentionMs ?? DEFAULT_RECEIPT_RETENTION_MS;
  const logger = options.logger;
  const sweep = options.sweep ?? sweepUnreferencedReceipts;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let inFlight: Promise<SweepUnreferencedReceiptsResult> | null = null;

  async function runPass(): Promise<SweepUnreferencedReceiptsResult> {
    const outcome = await sweep(options.db, {
      ...(options.root === undefined ? {} : { root: options.root }),
      retentionMs,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
    logger?.info?.('purchases receipt retention sweep complete', { ...outcome });
    return outcome;
  }

  function runOnce(): Promise<SweepUnreferencedReceiptsResult> {
    if (inFlight !== null) return inFlight;
    inFlight = runPass().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  }

  async function tick(): Promise<void> {
    try {
      await runOnce();
    } catch (err) {
      logger?.warn?.('purchases receipt retention sweep failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    arm();
  }

  void tick();

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    runOnce,
    async drain(): Promise<void> {
      while (inFlight !== null) {
        await inFlight.catch(() => undefined);
      }
    },
  };
}
