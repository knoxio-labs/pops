import { and, eq } from 'drizzle-orm';

import { PersonAccountEntityConflictError } from '../errors.js';
import { accounts } from '../schema.js';
import { entityIdentity, type EntityIdentities } from './entity-identity.js';

import type { FinanceDb } from './internal.js';

/** Enforce one person ledger per canonical contact/currency while retaining historical account references. */
export function assertCanonicalPersonAccountAvailable(
  db: FinanceDb,
  input: { kind: string; entityId: string | null; currency: string },
  identities?: EntityIdentities,
  currentId?: string
): void {
  if (identities === undefined || input.kind !== 'person' || input.entityId === null) return;
  const canonical = entityIdentity(input.entityId, identities);
  const existing = db
    .select({ id: accounts.id, entityId: accounts.entityId })
    .from(accounts)
    .where(and(eq(accounts.kind, 'person'), eq(accounts.currency, input.currency)))
    .all();
  if (
    existing.some(
      (account) =>
        account.id !== currentId && entityIdentity(account.entityId, identities) === canonical
    )
  ) {
    throw new PersonAccountEntityConflictError(input.entityId, input.currency);
  }
}
