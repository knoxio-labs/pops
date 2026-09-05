/**
 * Month-end balance trends (POPS-2879, ADR-051) — the twelve-month series the
 * account page's balance card charts.
 *
 * Split from `account-balance.ts` so neither file has to carry both the
 * point-in-time reading and the calendar walking; the anchoring rule is the
 * same one, imported rather than restated.
 */
import { eq, sql, sum } from 'drizzle-orm';

import { transactions } from '../schema.js';
import { anchorFor, sumThrough, today } from './account-balance-anchor.js';

import type { FinanceDb } from './internal.js';

/** One point on a balance trend. */
export interface BalancePoint {
  /** `YYYY-MM`. The balance is that month's last day, end of day. */
  month: string;
  balanceCents: number;
}

/** Last day of `month` (`YYYY-MM`) as ISO `YYYY-MM-DD`. */
export function monthEnd(month: string): string {
  const [year, monthOfYear] = month.split('-').map(Number);
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year ?? 0, monthOfYear ?? 1, 0)).toISOString().slice(0, 10);
}

/** `YYYY-MM`, `offset` months before the month `from` falls in. */
function monthBefore(from: string, offset: number): string {
  const [year, monthOfYear] = from.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (monthOfYear ?? 1) - 1 - offset, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * Month-end balances, oldest first, ending with the month `endingAt` falls in.
 *
 * The transaction side is one grouped query rather than one per month: SQLite
 * returns a row per month the account moved in, and a running total over those
 * rows gives `Σ(tx.date <= monthEnd)` for every month at once. Only the anchor
 * prefix sums are read individually, and there are at most as many of those as
 * the account has checkpoints.
 */
export function balanceHistory(
  db: FinanceDb,
  accountId: string,
  months = 12,
  endingAt: string = today()
): BalancePoint[] {
  const monthColumn = sql<string>`substr(${transactions.date}, 1, 7)`;
  const monthlyTotals = db
    .select({ month: monthColumn, total: sum(transactions.amountCents) })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .groupBy(monthColumn)
    .orderBy(monthColumn)
    .all();

  const wanted = Array.from({ length: months }, (_, index) =>
    monthBefore(endingAt, months - 1 - index)
  );

  const anchorPrefix = new Map<string, number>();
  const prefixThrough = (date: string): number => {
    const cached = anchorPrefix.get(date);
    if (cached !== undefined) return cached;
    const computed = sumThrough(db, accountId, date);
    anchorPrefix.set(date, computed);
    return computed;
  };

  // `wanted` is ascending and `monthlyTotals` is ordered, so one pointer walks
  // both: a month the account never moved in carries the running total
  // forward rather than reading zero.
  let cursor = 0;
  let through = 0;
  return wanted.map((month) => {
    while (cursor < monthlyTotals.length && (monthlyTotals[cursor]?.month ?? '') <= month) {
      through += Number(monthlyTotals[cursor]?.total ?? 0);
      cursor += 1;
    }
    const checkpoint = anchorFor(db, accountId, monthEnd(month));
    return {
      month,
      balanceCents:
        checkpoint === undefined
          ? through
          : checkpoint.balanceCents + through - prefixThrough(checkpoint.asOf),
    };
  });
}
