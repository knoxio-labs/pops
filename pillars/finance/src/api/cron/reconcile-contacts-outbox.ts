/**
 * Background reconciler for the contacts pre-create outbox (issue #3683,
 * ADR-039 pillar isolation workstream 4).
 *
 * `commitImport` queues a row here (via `entityPrecreateOutboxService`)
 * whenever a pending entity's create-or-fetch-by-name call fails because
 * contacts is unreachable, writing a `pending:contact:{uuid}` placeholder
 * into the finance tx instead of aborting the whole commit. This worker
 * periodically retries every still-`pending` row against contacts; on
 * success it rewrites the placeholder to the real contact id everywhere it
 * was written (`transactions` / `transaction_corrections` /
 * `transaction_tag_rules`) and marks the row resolved, atomically. A
 * `ContactsUnavailableError` (or any other failure) bumps the row's
 * `attempts`/`lastError` and leaves it pending for the next tick — UNLESS
 * this attempt just reached `maxAttempts`, in which case the row is
 * dead-lettered (`status = 'failed'`) and `listPending` stops selecting it,
 * so a contacts outage that never clears can't retry the same row forever.
 *
 * A recursive `setTimeout` arms the next tick only after the current one
 * resolves — mirrors `reconcile-cross-pillar.ts` (also trivial to drive with
 * `vi.useFakeTimers()` in tests) — fan-out per tick is sequential rather than
 * parallel: a contacts outage backlog is at most a handful of imports' worth
 * of pending contacts, and predictable load beats a thundering herd against a
 * pillar that just came back up.
 */
import { entityPrecreateOutboxService, type FinanceDb } from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';

import type { EntityPrecreateOutboxRow } from '../../db/index.js';

/** Retry cadence: frequent enough to heal a short contacts outage quickly,
 * without hammering a pillar that's still recovering. */
const DEFAULT_INTERVAL_MS = 60_000;

export interface ReconcileWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ReconcileContactsOutboxOptions {
  db: FinanceDb;
  contacts: ContactsClient;
  intervalMs?: number;
  /** Cap on reconciliation attempts before a row is dead-lettered instead of
   * retried forever (default {@link entityPrecreateOutboxService.DEFAULT_MAX_RECONCILE_ATTEMPTS}). */
  maxAttempts?: number;
  logger?: ReconcileWorkerLogger;
  now?: () => Date;
}

export interface ReconcileOutboxTickStats {
  resolved: number;
  stillPending: number;
  /** Rows dead-lettered THIS tick (attempts just reached `maxAttempts`). */
  failed: number;
}

export interface ReconcileContactsOutboxHandle {
  stop: () => void;
  /**
   * Run a single reconciliation pass synchronously and return the per-pass
   * stats. Exposed for tests and for the boot script to fire an immediate
   * pass before arming the timer.
   */
  runOnce: () => Promise<ReconcileOutboxTickStats>;
}

function emptyStats(): ReconcileOutboxTickStats {
  return { resolved: 0, stillPending: 0, failed: 0 };
}

/** Outcome of one {@link resolveOne} attempt, feeding the per-tick stats. */
type ResolveOneOutcome = 'resolved' | 'pending' | 'failed';

interface ResolveOneContext {
  db: FinanceDb;
  contacts: ContactsClient;
  row: EntityPrecreateOutboxRow;
  now: Date;
  maxAttempts: number;
  logger: ReconcileWorkerLogger | undefined;
}

/**
 * Attempt to resolve one outbox row against contacts. Returns `'resolved'`
 * when the row resolved (reassignment + `markResolved` committed
 * atomically), `'pending'` when it's still under the attempt cap and will be
 * retried next tick, or `'failed'` when this attempt just tipped it over
 * `maxAttempts` and it has been dead-lettered instead.
 */
async function resolveOne(ctx: ResolveOneContext): Promise<ResolveOneOutcome> {
  const { db, contacts, row, now, maxAttempts, logger } = ctx;
  try {
    const { id: realEntityId } = await contacts.createOrFetchByName(row.name, row.type);
    const counts = db.transaction((tx) => {
      const reassigned = entityPrecreateOutboxService.reassignEntityId(tx, row.id, realEntityId);
      entityPrecreateOutboxService.markResolved(tx, row.id, realEntityId, now.toISOString());
      return reassigned;
    });
    logger?.info?.('finance contacts outbox resolved', {
      id: row.id,
      name: row.name,
      entityId: realEntityId,
      ...counts,
    });
    return 'resolved';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = entityPrecreateOutboxService.recordAttemptFailure(db, row.id, {
      nowIso: now.toISOString(),
      error: message,
      maxAttempts,
    });
    if (outcome === 'failed') {
      logger?.warn?.('finance contacts outbox row dead-lettered — giving up after max attempts', {
        id: row.id,
        name: row.name,
        maxAttempts,
        error: message,
      });
      return 'failed';
    }
    logger?.warn?.('finance contacts outbox still pending', {
      id: row.id,
      name: row.name,
      error: message,
    });
    return 'pending';
  }
}

export function startReconcileContactsOutboxWorker(
  options: ReconcileContactsOutboxOptions
): ReconcileContactsOutboxHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts =
    options.maxAttempts ?? entityPrecreateOutboxService.DEFAULT_MAX_RECONCILE_ATTEMPTS;
  const now = options.now ?? ((): Date => new Date());
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function runOnce(): Promise<ReconcileOutboxTickStats> {
    const stats = emptyStats();
    const rows = entityPrecreateOutboxService.listPending(options.db);
    for (const row of rows) {
      const outcome = await resolveOne({
        db: options.db,
        contacts: options.contacts,
        row,
        now: now(),
        maxAttempts,
        logger,
      });
      if (outcome === 'resolved') stats.resolved += 1;
      else if (outcome === 'failed') stats.failed += 1;
      else stats.stillPending += 1;
    }
    logger?.info?.('finance contacts outbox tick complete', { ...stats, count: rows.length });
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
      logger?.warn?.('finance contacts outbox tick failed', {
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
