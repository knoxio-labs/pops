/**
 * Nightly paired-transfer reconciliation worker for the finance pillar
 * (#3607 Stage 3d).
 *
 * The commit-time phase only pairs a freshly-imported transfer against rows that
 * already exist when its batch commits; a leg imported before its counterpart
 * stays unlinked. This worker sweeps every still-unpaired, un-rule-classified row
 * and links the ones that now have a unique mutual counterpart, using the exact
 * same `attemptPairForRow` orchestrator as the commit phase — so both trigger
 * points share one definition of a valid pair.
 *
 * Self-gated: a tick is a no-op returning empty stats unless
 * `FINANCE_TRANSFER_PAIR_ENABLED` is set, so the worker is armed unconditionally
 * at boot and stays inert in production until #3608 ships real per-account
 * values (every CSV row is still `account: 'Amex'`, making the different-account
 * predicate meaningless).
 *
 * A recursive `setTimeout` arms the next tick only after the current one
 * returns, which keeps the fan-out sequential and makes the worker trivial to
 * drive with `vi.useFakeTimers()`. Unlike the async cross-pillar worker this one
 * does NOT fire an immediate pass at construction — `runOnce` is synchronous and
 * a boot-time sweep of a large table would block startup — so the first
 * scheduled pass lands after `intervalMs`. A caller wanting an immediate
 * catch-up (e.g. right after enabling the flag) can invoke `runOnce` directly.
 */
import { transactionsService, transferPairsService, type FinanceDb } from '../../db/index.js';
import { attemptPairForRow } from '../modules/transfers/pair-runner.js';
import {
  getTransferPairWindowDays,
  isTransferPairEnabled,
} from '../modules/transfers/pair-transfers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReconcilePairedTransfersLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ReconcilePairedTransfersOptions {
  db: FinanceDb;
  intervalMs?: number;
  logger?: ReconcilePairedTransfersLogger;
}

export interface PairedTransfersTickStats {
  /** Rows examined this pass (0 when the gate is off). */
  examined: number;
  /** Pairs linked (each links two rows). */
  linked: number;
  /** Rows with a candidate but no mutually-unique match, left for manual resolution. */
  ambiguous: number;
  /** Rows with no counterpart, or already linked by an earlier row this pass. */
  skipped: number;
}

export interface ReconcilePairedTransfersHandle {
  stop: () => void;
  /**
   * Run a single reconciliation pass synchronously and return its stats.
   * Exposed for tests and for a boot script that wants an immediate catch-up.
   */
  runOnce: () => PairedTransfersTickStats;
}

function emptyStats(): PairedTransfersTickStats {
  return { examined: 0, linked: 0, ambiguous: 0, skipped: 0 };
}

export function startReconcilePairedTransfersWorker(
  options: ReconcilePairedTransfersOptions
): ReconcilePairedTransfersHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function runOnce(): PairedTransfersTickStats {
    if (!isTransferPairEnabled()) return emptyStats();

    const windowDays = getTransferPairWindowDays();
    const stats = emptyStats();
    for (const id of transferPairsService.listUnpairedTransactionIds(options.db)) {
      stats.examined += 1;
      try {
        const row = transactionsService.getTransaction(options.db, id);
        const outcome = attemptPairForRow(options.db, row, windowDays);
        if (outcome === 'linked') stats.linked += 1;
        else if (outcome === 'ambiguous') stats.ambiguous += 1;
        else stats.skipped += 1;
      } catch (err) {
        stats.skipped += 1;
        logger?.warn?.('finance paired-transfer reconcile row failed', {
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger?.info?.('finance paired-transfer reconcile tick complete', { ...stats });
    return stats;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      tick();
    }, intervalMs);
  }

  function tick(): void {
    try {
      runOnce();
    } catch (err) {
      logger?.warn?.('finance paired-transfer reconcile tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    arm();
  }

  arm();

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    runOnce,
  };
}
