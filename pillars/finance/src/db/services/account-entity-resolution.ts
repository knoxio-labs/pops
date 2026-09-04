/**
 * Fill in a pending `person` account's `entityId` once
 * `reconcile-contacts-outbox.ts` resolves the real contact id (POPS-2771).
 * Split out of `accounts.ts` (which `createAccount` needs to stay under the
 * repo's 200-line cap) — this side has no callers inside `accounts.ts`
 * itself, only the outbox reconciler.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { PersonAccountEntityConflictError } from '../errors.js';
import { accounts } from '../schema.js';
import { isAccountEntityCurrencyConflict } from './account-conflict.js';
import { getAccount, type AccountRow } from './accounts.js';

import type { FinanceDb } from './internal.js';

/**
 * Guarded on `entityId IS NULL` so a row a winning concurrent resolution
 * already filled in is left untouched — returns the current row as-is rather
 * than re-writing it, mirroring `archiveAccount`'s idempotency. Throws
 * `AccountNotFoundError` if the account itself no longer exists, and
 * `PersonAccountEntityConflictError` (mapped from
 * `idx_accounts_entity_currency`) when another account already claimed this
 * contact + currency pair — a resolution the outbox cannot retry its way out
 * of, since contacts will resolve the same name to the same id every time.
 */
export function resolvePendingPersonAccountEntity(
  db: FinanceDb,
  accountId: string,
  entityId: string
): AccountRow {
  const current = getAccount(db, accountId);
  if (current.entityId !== null) return current;

  try {
    db.update(accounts)
      .set({ entityId, updatedAt: new Date().toISOString() })
      .where(and(eq(accounts.id, accountId), isNull(accounts.entityId)))
      .run();
  } catch (err) {
    if (isAccountEntityCurrencyConflict(err)) {
      throw new PersonAccountEntityConflictError(entityId, current.currency);
    }
    throw err;
  }
  return getAccount(db, accountId);
}
