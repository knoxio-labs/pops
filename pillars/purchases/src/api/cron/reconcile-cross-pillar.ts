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
 *   - **An empty leg is visibly empty.** Each leg reports the size of its
 *     own work set, because four zero counters otherwise describe both a
 *     leg where everything resolved and a leg nothing has ever written to
 *     — and the second is the state this cron exists to make visible.
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
import { addCounts, emptyCounts, LEGS, runLeg } from './reconcile-legs.js';

import type { PurchasesDb } from '../../db/index.js';
import type {
  ReconcileLegStats,
  ReconcileLookups,
  ReconcileTickStats,
  ReconcileWorkerLogger,
} from './reconcile-legs.js';

export {
  parseSoftUri,
  type ReconcileCounts,
  type ReconcileLegStats,
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
  /** Cancel the next scheduled tick. Does NOT wait for a tick already running. */
  stop: () => void;
  /**
   * Run one pass and return its stats. Exposed for tests and for a boot
   * script that wants an immediate pass before arming the timer.
   *
   * A call made while a pass is already in flight joins that pass rather
   * than starting a second, overlapping one — the worker has no
   * `request()`-style burst trigger to coalesce, so there is never a reason
   * for two passes to read `options.db` at once.
   */
  runOnce: () => Promise<ReconcileTickStats>;
  /**
   * Settle any in-flight pass.
   *
   * The shutdown primitive, not a test helper — mirrors `SweepRunner.drain`.
   * `stop()` only cancels the next scheduled timer; the pass this worker
   * fires immediately on construction (`void tick()` below) is already
   * running by the time a caller gets a handle back, and a pass reads and
   * writes through `options.db` across several `await`s. Closing that
   * database before `drain()` resolves lets a suspended pass resume against
   * a handle that is gone, which better-sqlite3 does not fail softly for
   * every call site — see `reconcile-cross-pillar.test.ts`'s "draining
   * before the database closes" cases.
   */
  drain: () => Promise<void>;
}

export function startReconcileCrossPillarWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const now = options.now ?? ((): Date => new Date());
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  /** The currently-running pass, if any — what `drain()` waits on. */
  let inFlight: Promise<ReconcileTickStats> | null = null;

  async function runPass(): Promise<ReconcileTickStats> {
    const legs: ReconcileLegStats[] = [];
    const totals = emptyCounts();
    for (const leg of LEGS) {
      const legStats = await runLeg({ db: options.db, leg, lookups: options.lookups, logger, now });
      addCounts(totals, legStats);
      legs.push(legStats);
    }
    // Totals only. Each leg has already logged its own line, so nesting the
    // breakdown here would repeat it; the return value is where a caller
    // that wants the per-leg numbers reads them.
    logger?.info?.('purchases reconcile tick complete', { ...totals });
    return { ...totals, legs };
  }

  function runOnce(): Promise<ReconcileTickStats> {
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
    async drain(): Promise<void> {
      while (inFlight !== null) {
        await inFlight.catch(() => undefined);
      }
    },
  };
}
