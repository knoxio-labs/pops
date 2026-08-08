/**
 * The credential-retention sweep.
 *
 * `pairing_codes` and `refresh_tokens` are the two tables in `bfm.db`
 * nothing else ever deletes from — `../../db/services/prune-credentials.ts`
 * states the retention rule each follows and why they differ. This is the
 * scheduling around that rule, and nothing else: the same recursive-timer
 * shape as `pillars/purchases/src/api/cron/reconcile-cross-pillar.ts`, so a
 * slow pass can never pile runs up and a test can drive it deterministically
 * with `vi.useFakeTimers()` instead of a real clock.
 *
 * Started unconditionally from `server.ts`, alongside bfm's other
 * background work — a tick against a table with nothing to prune is a
 * no-op, so there is no configuration that would make skipping it safer.
 */
import { pruneDeadRefreshTokens, prunePairingCodes } from '../../db/services/prune-credentials.js';

import type { BfmDb } from '../../db/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PruneCredentialsWorkerLogger {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
}

export interface PruneCredentialsWorkerOptions {
  db: BfmDb;
  /** Overridable so a smoke test does not wait a day for the second tick. */
  intervalMs?: number;
  logger?: PruneCredentialsWorkerLogger;
  /** Injectable clock, for tests. Forwarded to both prune calls unchanged. */
  now?: () => Date;
}

export interface PruneCredentialsTickStats {
  readonly pairingCodesDeleted: number;
  readonly refreshTokensDeleted: number;
}

export interface PruneCredentialsWorkerHandle {
  stop: () => void;
  /** Run one pass and return its counts. Exposed for tests and for a boot script that wants one before the timer arms. */
  runOnce: () => PruneCredentialsTickStats;
}

export function startPruneCredentialsWorker(
  options: PruneCredentialsWorkerOptions
): PruneCredentialsWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function runOnce(): PruneCredentialsTickStats {
    const pairingCodesDeleted = prunePairingCodes(options.db, { now: options.now });
    const refreshTokensDeleted = pruneDeadRefreshTokens(options.db, { now: options.now });
    logger?.info?.('bfm credential prune tick complete', {
      pairingCodesDeleted,
      refreshTokensDeleted,
    });
    return { pairingCodesDeleted, refreshTokensDeleted };
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      tick();
    }, intervalMs);
    timer.unref?.();
  }

  function tick(): void {
    try {
      runOnce();
    } catch (err) {
      logger?.warn?.('bfm credential prune tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    arm();
  }

  tick();

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    runOnce,
  };
}
