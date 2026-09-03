/**
 * Per-row resolution logic for the contacts pre-create outbox reconciler,
 * split out of `reconcile-contacts-outbox.ts` to keep that file under the
 * repo's 200-line cap. See that file's header for the overall design.
 *
 * A row waits on one of two different records (POPS-2771): most carry a
 * `pending:contact:{uuid}` placeholder as their own `id`, swept out of
 * `transactions` / `transaction_corrections` / `transaction_tag_rules`
 * (`reassignEntityId`). A `person` account instead keeps `entity_id`
 * genuinely NULL while pending, so its row carries `accountId` and gets a
 * direct fill-in (`resolvePendingPersonAccountEntity`) instead —
 * `applyResolution` is where that discrimination happens.
 */
import {
  entityPrecreateOutboxService,
  PersonAccountEntityConflictError,
  resolvePendingPersonAccountEntity,
  type EntityPrecreateOutboxRow,
  type FinanceDb,
} from '../../db/index.js';
import { ContactsPermanentError, ContactsUnavailableError } from '../contacts/client.js';
import { NO_CREDENTIAL_REASON } from '../pillars/outbound.js';

import type { ContactsClient } from '../contacts/client.js';
import type { ReconcileWorkerLogger } from './reconcile-contacts-outbox.js';

/**
 * True when the failure is this process holding no service-account key, as
 * opposed to contacts being unreachable. Nothing was sent, so the row must not
 * be charged an attempt for it (POPS-2690).
 */
function isMissingCredential(err: unknown): boolean {
  return err instanceof ContactsUnavailableError && err.detail === NO_CREDENTIAL_REASON;
}

/** Outcome of one {@link resolveOne} attempt, feeding the per-tick stats. */
export type ResolveOneOutcome = 'resolved' | 'pending' | 'failed' | 'deferred';

export interface ResolveOneContext {
  db: FinanceDb;
  contacts: ContactsClient;
  row: EntityPrecreateOutboxRow;
  now: Date;
  maxAttempts: number;
  logger: ReconcileWorkerLogger | undefined;
}

/**
 * Apply a resolved `realEntityId` to whichever record `row` is waiting on,
 * and mark the outbox row resolved — all inside the caller's transaction.
 * See this file's header for the two-shape discrimination.
 */
function applyResolution(
  tx: FinanceDb,
  row: EntityPrecreateOutboxRow,
  realEntityId: string,
  nowIso: string
): entityPrecreateOutboxService.ReassignEntityIdCounts | null {
  if (row.accountId !== null) {
    resolvePendingPersonAccountEntity(tx, row.accountId, realEntityId);
    entityPrecreateOutboxService.markResolved(tx, row.id, realEntityId, nowIso);
    return null;
  }
  const reassigned = entityPrecreateOutboxService.reassignEntityId(tx, row.id, realEntityId);
  entityPrecreateOutboxService.markResolved(tx, row.id, realEntityId, nowIso);
  return reassigned;
}

/** A permanent refusal is contacts' verdict on this request, not a bad
 * moment: the same call will be rejected identically forever, so it
 * dead-letters here rather than after 50 identical rejections — and stays
 * dead-lettered across the boot requeue. A `PersonAccountEntityConflictError`
 * is the account-side equivalent: two pending `person` accounts resolved to
 * the same real contact + currency, and no amount of retrying changes that
 * (POPS-2771) — it dead-letters on this attempt exactly like a
 * `ContactsPermanentError` does. */
function isPermanentFailure(err: unknown): boolean {
  return err instanceof ContactsPermanentError || err instanceof PersonAccountEntityConflictError;
}

/**
 * Attempt to resolve one outbox row against contacts. Returns `'resolved'`
 * when the row resolved (resolution + `markResolved` committed atomically),
 * `'pending'` when it's still under the attempt cap and will be retried next
 * tick, `'failed'` when this attempt just tipped it over `maxAttempts` (or hit
 * a permanent failure) and it has been dead-lettered instead, or `'deferred'`
 * when there was no credential to call contacts with and the row was left as
 * it is.
 */
export async function resolveOne(ctx: ResolveOneContext): Promise<ResolveOneOutcome> {
  const { db, contacts, row, now, logger } = ctx;
  try {
    const { id: realEntityId } = await contacts.createOrFetchByName(row.name, row.type);
    const counts = db.transaction((tx) =>
      applyResolution(tx, row, realEntityId, now.toISOString())
    );
    logger?.info?.('finance contacts outbox resolved', {
      id: row.id,
      name: row.name,
      entityId: realEntityId,
      accountId: row.accountId,
      ...counts,
    });
    return 'resolved';
  } catch (err) {
    return recordFailure(ctx, err);
  }
}

/** The `catch` arm of {@link resolveOne}, split out purely to keep that
 * function's branch count under the repo's complexity cap. */
async function recordFailure(ctx: ResolveOneContext, err: unknown): Promise<ResolveOneOutcome> {
  const { db, row, now, maxAttempts, logger } = ctx;
  const message = err instanceof Error ? err.message : String(err);
  if (isMissingCredential(err)) {
    entityPrecreateOutboxService.recordAttemptDeferred(db, row.id, {
      nowIso: now.toISOString(),
      error: message,
    });
    return 'deferred';
  }

  const permanent = isPermanentFailure(err);
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
