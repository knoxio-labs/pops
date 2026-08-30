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
 * Three rules keep that cap from turning a configuration fault into permanent
 * data damage (POPS-2690). A failure that never reached contacts at all —
 * this process holds no service-account key — is deferred rather than charged
 * an attempt, because retrying cannot fix what only a redeploy can. A
 * permanent refusal from contacts dead-letters immediately and is never
 * requeued, because no restart changes contacts' verdict on the request. And
 * every other dead-lettered row is requeued once at boot, on the reasoning
 * that a restart is the operator attention the dead-letter was asking for.
 *
 * A recursive `setTimeout` arms the next tick only after the current one
 * resolves — mirrors `reconcile-cross-pillar.ts` (also trivial to drive with
 * `vi.useFakeTimers()` in tests) — fan-out per tick is sequential rather than
 * parallel: a contacts outage backlog is at most a handful of imports' worth
 * of pending contacts, and predictable load beats a thundering herd against a
 * pillar that just came back up.
 */
import { entityPrecreateOutboxService, type FinanceDb } from '../../db/index.js';
import {
  ContactsPermanentError,
  ContactsUnavailableError,
  type ContactsClient,
} from '../contacts/client.js';
import { NO_CREDENTIAL_REASON } from '../pillars/outbound.js';

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
  /**
   * Rows left untouched because this process holds no service-account key and
   * contacts could not be asked at all. They keep their attempts — see
   * `entityPrecreateOutboxService.recordAttemptDeferred`.
   */
  deferred: number;
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
  return { resolved: 0, stillPending: 0, failed: 0, deferred: 0 };
}

/**
 * True when the failure is this process holding no service-account key, as
 * opposed to contacts being unreachable. Nothing was sent, so the row must not
 * be charged an attempt for it (POPS-2690).
 */
function isMissingCredential(err: unknown): boolean {
  return err instanceof ContactsUnavailableError && err.detail === NO_CREDENTIAL_REASON;
}

/** Outcome of one {@link resolveOne} attempt, feeding the per-tick stats. */
type ResolveOneOutcome = 'resolved' | 'pending' | 'failed' | 'deferred';

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
 * retried next tick, `'failed'` when this attempt just tipped it over
 * `maxAttempts` and it has been dead-lettered instead, or `'deferred'` when
 * there was no credential to call contacts with and the row was left as it is.
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
    if (isMissingCredential(err)) {
      entityPrecreateOutboxService.recordAttemptDeferred(db, row.id, {
        nowIso: now.toISOString(),
        error: message,
      });
      return 'deferred';
    }
    // A permanent refusal is contacts' verdict on this request, not a bad
    // moment: the same call will be rejected identically forever, so it
    // dead-letters here rather than after 50 identical rejections — and stays
    // dead-lettered across the boot requeue.
    const permanent = err instanceof ContactsPermanentError;
    const outcome = entityPrecreateOutboxService.recordAttemptFailure(db, row.id, {
      nowIso: now.toISOString(),
      error: message,
      maxAttempts,
      permanent,
    });
    if (outcome === 'failed') {
      logger?.warn?.(
        permanent
          ? 'finance contacts outbox row dead-lettered — contacts refused it, retrying cannot help'
          : 'finance contacts outbox row dead-lettered — giving up after max attempts',
        { id: row.id, name: row.name, maxAttempts, permanent, error: message }
      );
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

/** Everything one pass needs, plus the worker-scoped report-once sink. */
interface TickContext {
  db: FinanceDb;
  contacts: ContactsClient;
  now: () => Date;
  maxAttempts: number;
  logger: ReconcileWorkerLogger | undefined;
  /** Called with the number of rows left unattempted when the credential is missing. */
  reportDeferred: (rows: number) => void;
}

/**
 * One reconciliation pass over every pending row.
 *
 * Stops at the first missing-credential refusal: holding no key is a fact
 * about the process, not about the row that happened to surface it, so
 * walking the rest would stamp every one of them for a call that cannot be
 * made.
 */
async function runReconcileTick(ctx: TickContext): Promise<ReconcileOutboxTickStats> {
  const stats = emptyStats();
  const rows = entityPrecreateOutboxService.listPending(ctx.db);
  for (const [index, row] of rows.entries()) {
    const outcome = await resolveOne({
      db: ctx.db,
      contacts: ctx.contacts,
      row,
      now: ctx.now(),
      maxAttempts: ctx.maxAttempts,
      logger: ctx.logger,
    });
    if (outcome === 'resolved') stats.resolved += 1;
    else if (outcome === 'failed') stats.failed += 1;
    else if (outcome === 'pending') stats.stillPending += 1;
    else {
      stats.deferred = rows.length - index;
      ctx.reportDeferred(stats.deferred);
      break;
    }
  }
  ctx.logger?.info?.('finance contacts outbox tick complete', {
    ...stats,
    count: rows.length,
    deadLettered: entityPrecreateOutboxService.countByStatus(ctx.db).failed,
  });
  return stats;
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
  let reportedMissingCredential = false;

  async function runOnce(): Promise<ReconcileOutboxTickStats> {
    return runReconcileTick({
      db: options.db,
      contacts: options.contacts,
      now,
      maxAttempts,
      logger,
      reportDeferred: (rows: number) => {
        if (reportedMissingCredential) return;
        reportedMissingCredential = true;
        logger?.warn?.(
          'finance contacts outbox deferred — no service-account key, attempts not spent',
          { rows }
        );
      },
    });
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

  // A dead-lettered row is waiting on an operator, and an operator's fix — a
  // mounted secret, a granted scope, a contacts deployment — reaches this
  // process as a restart. Requeueing here is what makes that fix retroactive;
  // without it the placeholder ids a dead-lettered row left on real rows are
  // permanent (POPS-2690).
  const requeued = entityPrecreateOutboxService.requeueDeadLettered(options.db);
  if (requeued > 0) {
    logger?.info?.('finance contacts outbox requeued dead-lettered rows on boot', {
      count: requeued,
    });
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
