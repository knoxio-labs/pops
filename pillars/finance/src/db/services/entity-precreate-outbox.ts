/**
 * Contacts pre-create outbox (issue #3683, ADR-039 pillar isolation
 * workstream 4).
 *
 * The import commit's entity pre-create write path used to hard-fail the
 * whole commit when the contacts pillar was briefly unavailable — asymmetric
 * with the read side (matcher / entity-usage), which already degrades
 * gracefully. This table lets the commit persist a `pending:contact:{uuid}`
 * placeholder into `transactions.entity_id` / `transaction_corrections.entity_id`
 * / `transaction_tag_rules.entity_id` instead of aborting, and queues a row
 * here so a background reconciler (`../cron/reconcile-contacts-outbox.ts`) can
 * resolve it against contacts once the outage clears — rewriting the
 * placeholder to the real contact id everywhere it was written. A row that
 * fails to resolve `DEFAULT_MAX_RECONCILE_ATTEMPTS` times in a row is
 * dead-lettered (`status = 'failed'`) rather than retried forever.
 *
 * Standard service pattern: db-arg services (callers control the connection
 * and can pass a transaction), plain functions, typed domain errors, no HTTP
 * concerns.
 */
import { and, eq, sql } from 'drizzle-orm';

import { PENDING_CONTACT_ID_PREFIX } from '../../contract/entity-id.js';
import {
  entityPrecreateOutbox,
  transactionCorrections,
  transactions,
  transactionTagRules,
} from '../schema.js';

import type { EntityType } from '../entity-types.js';
import type { FinanceDb } from './internal.js';

export { PENDING_CONTACT_ID_PREFIX, isPendingContactId } from '../../contract/entity-id.js';

/** Mint a fresh placeholder entity id for an outbox row. */
export function buildPendingContactId(): string {
  return `${PENDING_CONTACT_ID_PREFIX}${crypto.randomUUID()}`;
}

/** Raw drizzle row shape. */
export type EntityPrecreateOutboxRow = typeof entityPrecreateOutbox.$inferSelect;

/**
 * Default cap on reconciliation attempts before a row is dead-lettered
 * (`status = 'failed'`) instead of retried forever. A contacts outage that
 * outlives this many 60s-interval ticks (~50 minutes at the default) is
 * treated as needing operator attention, not an infinite background retry.
 */
export const DEFAULT_MAX_RECONCILE_ATTEMPTS = 50;

/**
 * Queue a pending contact pre-create. For the transaction-side flow, `id` is
 * the placeholder written to `entity_id` columns (see
 * {@link buildPendingContactId}) and doubles as this row's primary key. For
 * the `person` account flow (POPS-2771), `id` is just this row's own primary
 * key — the account's `entity_id` stays genuinely NULL while pending, and
 * `accountId` names the account row the reconciler must fill in once contacts
 * resolves the name.
 */
export interface EnqueuePendingContactInput {
  id: string;
  name: string;
  type: EntityType;
  /** Set for the `person` account flow — see {@link EnqueuePendingContactInput}'s doc. */
  accountId?: string | null;
}

export function enqueue(db: FinanceDb, input: EnqueuePendingContactInput): void {
  db.insert(entityPrecreateOutbox)
    .values({
      id: input.id,
      name: input.name,
      type: input.type,
      accountId: input.accountId ?? null,
    })
    .run();
}

/** Every row still awaiting reconciliation, oldest first. */
export function listPending(db: FinanceDb): EntityPrecreateOutboxRow[] {
  return db
    .select()
    .from(entityPrecreateOutbox)
    .where(eq(entityPrecreateOutbox.status, 'pending'))
    .orderBy(entityPrecreateOutbox.createdAt)
    .all();
}

/** Status a row lands in after {@link recordAttemptFailure} — `'pending'`
 * when it's still under the attempt cap and will be retried next tick,
 * `'failed'` when this attempt just tipped it over the cap and it has been
 * dead-lettered. */
export type AttemptFailureOutcome = 'pending' | 'failed';

/** Input to {@link recordAttemptFailure}. */
export interface RecordAttemptFailureInput {
  nowIso: string;
  error: string;
  /** Cap on total attempts before the row is dead-lettered (default
   * {@link DEFAULT_MAX_RECONCILE_ATTEMPTS}). */
  maxAttempts?: number;
  /**
   * The failure is one retrying can never fix (a `ContactsPermanentError`),
   * so the row is dead-lettered on this attempt rather than after
   * `maxAttempts` of them, and marked `permanentFailure` so
   * {@link requeueDeadLettered} leaves it alone. Spending 50 attempts on a
   * request contacts will reject identically every time is pure noise, and
   * requeueing it every deploy would repeat that noise forever (POPS-2690).
   */
  permanent?: boolean;
}

/**
 * Record a reconciliation attempt that didn't resolve the row `id` — bumps
 * `attempts` (via an atomic SQL increment against whatever is currently
 * stored, so two overlapping ticks against the same row can never lose an
 * attempt to a stale in-memory read), stamps `lastAttemptAt`, and records
 * `lastError` for ops. Once the bumped count reaches `maxAttempts` the row is
 * dead-lettered (`status = 'failed'`) instead of staying `pending` forever,
 * so a contacts outage that never clears can't grow the outbox / retry loop
 * without bound; `listPending` stops selecting a `'failed'` row. `permanent`
 * dead-letters on this attempt instead of counting to the cap.
 *
 * Every mutation is guarded on `status = 'pending'` inside a single
 * transaction: reconciler passes interleave at the `await` on contacts, so a
 * losing pass must not resurrect or corrupt a row a concurrent pass already
 * marked `resolved` (or `failed`). If the guard matches no row this attempt is
 * a no-op and reports `'pending'` — the winning pass already recorded the
 * terminal state.
 */
export function recordAttemptFailure(
  db: FinanceDb,
  id: string,
  input: RecordAttemptFailureInput
): AttemptFailureOutcome {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_RECONCILE_ATTEMPTS;
  return db.transaction((tx) => {
    const bumped = tx
      .update(entityPrecreateOutbox)
      .set({
        attempts: sql`${entityPrecreateOutbox.attempts} + 1`,
        lastAttemptAt: input.nowIso,
        lastError: input.error,
      })
      .where(and(eq(entityPrecreateOutbox.id, id), eq(entityPrecreateOutbox.status, 'pending')))
      .run();
    if (bumped.changes === 0) return 'pending';

    if (!input.permanent) {
      const updated = tx
        .select({ attempts: entityPrecreateOutbox.attempts })
        .from(entityPrecreateOutbox)
        .where(eq(entityPrecreateOutbox.id, id))
        .get();
      if ((updated?.attempts ?? 0) < maxAttempts) return 'pending';
    }

    tx.update(entityPrecreateOutbox)
      .set({ status: 'failed', permanentFailure: input.permanent ?? false })
      .where(and(eq(entityPrecreateOutbox.id, id), eq(entityPrecreateOutbox.status, 'pending')))
      .run();
    return 'failed';
  });
}

/**
 * Record a reconciliation attempt that could not even be made, without
 * spending one of the row's {@link DEFAULT_MAX_RECONCILE_ATTEMPTS} attempts.
 *
 * The attempt cap exists to stop an outage that never clears from retrying
 * forever, and an outage is the only thing it can meaningfully bound. A
 * process holding no service-account key is not an outage: nothing was sent,
 * contacts was never asked, and no number of retries will change the answer
 * until the configuration does. Counting those as attempts dead-letters the
 * whole outbox in ~50 minutes for a fault the retry loop has no part in
 * (POPS-2689 did exactly that to 44 rows). The row keeps its `pending` status
 * and its attempt count, and still records `lastAttemptAt`/`lastError` so the
 * reason is visible to ops.
 *
 * Guarded on `status = 'pending'` for the same reason as
 * {@link recordAttemptFailure}: a losing interleaved pass must not stamp a row
 * a winning pass already resolved.
 */
export function recordAttemptDeferred(
  db: FinanceDb,
  id: string,
  input: { nowIso: string; error: string }
): void {
  db.update(entityPrecreateOutbox)
    .set({ lastAttemptAt: input.nowIso, lastError: input.error })
    .where(and(eq(entityPrecreateOutbox.id, id), eq(entityPrecreateOutbox.status, 'pending')))
    .run();
}

/** Count of rows per outbox status, for the tick log and `/health`. */
export interface OutboxStatusCounts {
  pending: number;
  resolved: number;
  failed: number;
}

/** How many rows sit in each status. Cheap enough for a per-tick log line. */
export function countByStatus(db: FinanceDb): OutboxStatusCounts {
  const counts: OutboxStatusCounts = { pending: 0, resolved: 0, failed: 0 };
  const rows = db
    .select({ status: entityPrecreateOutbox.status, count: sql<number>`count(*)` })
    .from(entityPrecreateOutbox)
    .groupBy(entityPrecreateOutbox.status)
    .all();
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

/**
 * Return the dead-lettered rows a restart could plausibly fix to the queue:
 * `status = 'pending'`, `attempts = 0`. Returns how many were requeued.
 *
 * Dead-lettering means "this needs operator attention", and the only thing
 * that ever attends to it is a configuration or deployment change — which
 * reaches this process as a restart. So the worker calls this once at boot
 * (see `cron/reconcile-contacts-outbox.ts`): without it a dead-lettered row is
 * terminal forever, and the placeholder ids it left behind in `transactions` /
 * `transaction_corrections` / `transaction_tag_rules` stay wrong even after the
 * cause is fixed. Cost of a wrong guess is bounded — a row whose cause has NOT
 * been fixed simply spends its attempts again and dead-letters once more.
 *
 * `permanentFailure` rows are excluded, and that exclusion is what keeps the
 * bound meaningful: a request contacts rejects on its own terms is not waiting
 * on an operator, so requeueing it every deploy would burn `maxAttempts`
 * against the same refusal forever.
 *
 * `lastError` is deliberately preserved: it is the only record of why the row
 * was given up on, and it stays useful right up until the retry overwrites it.
 */
export function requeueDeadLettered(db: FinanceDb): number {
  return db
    .update(entityPrecreateOutbox)
    .set({ status: 'pending', attempts: 0 })
    .where(
      and(
        eq(entityPrecreateOutbox.status, 'failed'),
        eq(entityPrecreateOutbox.permanentFailure, false)
      )
    )
    .run().changes;
}

/** Mark a row resolved once contacts confirms the real entity id. Does NOT
 * touch the referencing tables — call {@link reassignEntityId} first so a row
 * is never marked resolved while a stale placeholder is still on disk. */
export function markResolved(
  db: FinanceDb,
  id: string,
  resolvedEntityId: string,
  nowIso: string
): void {
  db.update(entityPrecreateOutbox)
    .set({
      status: 'resolved',
      resolvedEntityId,
      resolvedAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: null,
    })
    .where(eq(entityPrecreateOutbox.id, id))
    .run();
}

/** Rows affected per referencing table by a single {@link reassignEntityId} call. */
export interface ReassignEntityIdCounts {
  transactions: number;
  corrections: number;
  tagRules: number;
}

/**
 * Rewrite every occurrence of `placeholderId` in `entity_id` columns to
 * `realEntityId` across every table that can hold a commit-time entity
 * reference. Safe to re-run: a placeholder with zero remaining references
 * (already reassigned, or never referenced outside the outbox row itself)
 * updates zero rows in each table.
 */
export function reassignEntityId(
  db: FinanceDb,
  placeholderId: string,
  realEntityId: string
): ReassignEntityIdCounts {
  const txnResult = db
    .update(transactions)
    .set({ entityId: realEntityId })
    .where(eq(transactions.entityId, placeholderId))
    .run();
  const correctionsResult = db
    .update(transactionCorrections)
    .set({ entityId: realEntityId })
    .where(eq(transactionCorrections.entityId, placeholderId))
    .run();
  const tagRulesResult = db
    .update(transactionTagRules)
    .set({ entityId: realEntityId })
    .where(eq(transactionTagRules.entityId, placeholderId))
    .run();
  return {
    transactions: txnResult.changes,
    corrections: correctionsResult.changes,
    tagRules: tagRulesResult.changes,
  };
}
