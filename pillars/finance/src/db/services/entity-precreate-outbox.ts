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

import {
  entityPrecreateOutbox,
  transactionCorrections,
  transactions,
  transactionTagRules,
} from '../schema.js';

import type { EntityType } from '../entity-types.js';
import type { FinanceDb } from './internal.js';

/** Reserved namespace for a pending contact placeholder written to `entity_id`
 * columns while contacts is unreachable. Distinct from the request-scoped
 * `temp:entity:{uuid}` commit placeholder (see `commit-validation.ts`) — this
 * one IS meant to be persisted, and is only ever replaced by the reconciler. */
export const PENDING_CONTACT_ID_PREFIX = 'pending:contact:';

/** Mint a fresh placeholder entity id for an outbox row. */
export function buildPendingContactId(): string {
  return `${PENDING_CONTACT_ID_PREFIX}${crypto.randomUUID()}`;
}

/** True if `entityId` is an outbox placeholder rather than a real contact id. */
export function isPendingContactId(entityId: string): boolean {
  return entityId.startsWith(PENDING_CONTACT_ID_PREFIX);
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

/** Queue a pending contact pre-create. `id` is the placeholder written to
 * `entity_id` columns (see {@link buildPendingContactId}) and doubles as this
 * row's primary key. */
export interface EnqueuePendingContactInput {
  id: string;
  name: string;
  type: EntityType;
}

export function enqueue(db: FinanceDb, input: EnqueuePendingContactInput): void {
  db.insert(entityPrecreateOutbox)
    .values({ id: input.id, name: input.name, type: input.type })
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
}

/**
 * Record a reconciliation attempt that didn't resolve the row `id` — bumps
 * `attempts` (via an atomic SQL increment against whatever is currently
 * stored, so two overlapping ticks against the same row can never lose an
 * attempt to a stale in-memory read), stamps `lastAttemptAt`, and records
 * `lastError` for ops. Once the bumped count reaches `maxAttempts` the row is
 * dead-lettered (`status = 'failed'`) instead of staying `pending` forever,
 * so a contacts outage that never clears can't grow the outbox / retry loop
 * without bound; `listPending` stops selecting a `'failed'` row.
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

    const updated = tx
      .select({ attempts: entityPrecreateOutbox.attempts })
      .from(entityPrecreateOutbox)
      .where(eq(entityPrecreateOutbox.id, id))
      .get();
    if ((updated?.attempts ?? 0) < maxAttempts) return 'pending';

    tx.update(entityPrecreateOutbox)
      .set({ status: 'failed' })
      .where(and(eq(entityPrecreateOutbox.id, id), eq(entityPrecreateOutbox.status, 'pending')))
      .run();
    return 'failed';
  });
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
