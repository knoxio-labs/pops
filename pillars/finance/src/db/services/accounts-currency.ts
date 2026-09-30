import { inArray } from 'drizzle-orm';

import { accounts } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Resolve account IDs to their currency codes with one query; missing IDs have no entry. */
export function currenciesForAccountIds(
  db: FinanceDb,
  accountIds: readonly string[]
): Map<string, string> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Map();

  return new Map(
    db
      .select({ id: accounts.id, currency: accounts.currency })
      .from(accounts)
      .where(inArray(accounts.id, ids))
      .all()
      .map(({ id, currency }) => [id, currency])
  );
}
