/**
 * How many transactions an account carries (POPS-2924).
 *
 * A literal row count — every transaction on the account, pending or
 * settled, transfer or not — the same set `account-balance.ts`'s
 * `sumsThroughDate` sums over, and the same meaning
 * `AccountMergePreviewSchema.transactionCount` already has for a merge
 * preview. Filtering the count to "real spending" would make it answer a
 * different question from the balance sitting next to it on the wire, and
 * there is nothing in the schema (no soft-delete, no "committed" flag) that
 * would make such a filter meaningful today.
 */
import { count, inArray } from 'drizzle-orm';

import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/**
 * Transaction count for every given account, in one grouped query rather
 * than one per account, so a page of accounts is one round trip. An id with
 * no transactions at all is still present in the result, mapped to zero.
 */
export function transactionCountsFor(db: FinanceDb, accountIds: string[]): Map<string, number> {
  const counts = new Map(accountIds.map((accountId) => [accountId, 0]));
  if (accountIds.length === 0) return counts;

  const rows = db
    .select({ accountId: transactions.accountId, total: count() })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .groupBy(transactions.accountId)
    .all();

  for (const row of rows) counts.set(row.accountId, row.total);
  return counts;
}
