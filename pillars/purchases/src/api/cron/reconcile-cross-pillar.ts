/**
 * Nightly soft-URI reconciliation worker for the purchases pillar.
 *
 * Two columns hold references another pillar owns —
 * `purchase_item_units.inventory_item_uri` and
 * `purchase_documents.document_uri` — each with a `*_stale_at` companion
 * that ADR-042 says is resolved by a nightly cron and never at read time.
 * This worker is that cron, and the only writer of either companion.
 *
 * Per tick, per leg: take the distinct URIs, check the shape, ask the
 * owning pillar whether each still resolves, then mark or clear. The three
 * rules the outcome mapping exists to enforce:
 *
 *   - **`unavailable` is not `not-found`.** Only a genuine 404 stamps
 *     `staleAt`. A transport failure, a timeout or an upstream 5xx leaves
 *     the flag exactly as it was, or one outage marks the fleet stale.
 *   - **Clearing matters as much as marking.** A URI that resolves again
 *     un-stales, or a brief outage poisons the reference forever.
 *   - **Rows are flagged, never deleted.**
 *
 * The fan-out inside a tick is sequential, following the finance and
 * inventory crons: the periodic-cron contract prefers predictable load on
 * the owning pillar over a thundering herd.
 *
 * A recursive `setTimeout` arms the next tick only after the current one
 * settles, so a slow reconciliation cannot pile up overlapping runs — and
 * it makes the worker trivial to drive with `vi.useFakeTimers()`.
 *
 * Lookups are constructor-injected so tests wire a stub instead of an HTTP
 * transport; production wires the SDK proxies in `pillar-lookup.ts`. The
 * per-leg loop itself lives in `reconcile-legs.ts`.
 */
import { emptyStats, LEGS, runLeg } from './reconcile-legs.js';

import type { PurchasesDb } from '../../db/index.js';
import type {
  ReconcileLookups,
  ReconcileTickStats,
  ReconcileWorkerLogger,
} from './reconcile-legs.js';

export {
  parseSoftUri,
  type ReconcileLookupFn,
  type ReconcileLookupResult,
  type ReconcileLookups,
  type ReconcileTickStats,
  type ReconcileWorkerLogger,
} from './reconcile-legs.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReconcileWorkerOptions {
  db: PurchasesDb;
  lookups: ReconcileLookups;
  intervalMs?: number;
  logger?: ReconcileWorkerLogger;
  now?: () => Date;
}

export interface ReconcileWorkerHandle {
  stop: () => void;
  /**
   * Run one pass and return its stats. Exposed for tests and for a boot
   * script that wants an immediate pass before arming the timer.
   */
  runOnce: () => Promise<ReconcileTickStats>;
}

export function startReconcileCrossPillarWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const now = options.now ?? ((): Date => new Date());
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function runOnce(): Promise<ReconcileTickStats> {
    const stats = emptyStats();
    for (const leg of LEGS) {
      await runLeg({ db: options.db, leg, lookups: options.lookups, stats, logger, now });
    }
    logger?.info?.('purchases reconcile tick complete', { ...stats });
    return stats;
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
      logger?.warn?.('purchases reconcile tick failed', {
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
  };
}
