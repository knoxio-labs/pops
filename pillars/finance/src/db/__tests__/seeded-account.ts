/**
 * Look up the id of one of `0083_accounts.sql`'s two seeded accounts
 * ("Amex", "ANZ Credit Card") by name, for suites that insert `transactions`
 * rows directly (bypassing `transactionsService.createTransaction`, which
 * resolves `accountId` itself) and so must supply one by hand.
 */
import { sql } from 'drizzle-orm';

import { accounts } from '../schema.js';

import type { FinanceDb } from '../services/internal.js';

/** Case-insensitive, matching `idx_accounts_name_nocase`. */
export function seededAccountId(db: FinanceDb, name: string): string {
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(sql`${accounts.name} = ${name} COLLATE NOCASE`)
    .get();
  if (!row) throw new Error(`No seeded account named '${name}' — did 0083_accounts.sql run?`);
  return row.id;
}
