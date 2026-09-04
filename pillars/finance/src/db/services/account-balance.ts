/**
 * Account balance as of a point in time — the sum of every `amountCents` on
 * the account dated strictly before a cutoff.
 *
 * `merge-accounts.ts` sums the same column for its own (all-time) preview;
 * this is the date-scoped sibling a caller needs when it wants the balance
 * as it stood BEFORE a specific transaction rather than the account's
 * balance today — loan repayment interest (POPS-2830) is the first such
 * caller, since interest accrues on the balance outstanding before the
 * repayment that pays some of it off, not after.
 */
import { and, eq, lt, sum } from 'drizzle-orm';

import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Sum of `amountCents` for `accountId` dated strictly before `beforeDate` (`YYYY-MM-DD`). */
export function getAccountBalanceBefore(
  db: FinanceDb,
  accountId: string,
  beforeDate: string
): number {
  const row = db
    .select({ total: sum(transactions.amountCents) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), lt(transactions.date, beforeDate)))
    .get();
  return Number(row?.total ?? 0);
}
