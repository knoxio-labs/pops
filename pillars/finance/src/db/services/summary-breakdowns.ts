/**
 * The summary endpoint's grouped reads (POPS-3589): the window total, and
 * spend split by account and by month. The label-keyed breakdowns — by tag and
 * by entity — live in `summary-facets.ts`.
 *
 * Each is one grouped query over the ledger. Ordering and share-of-total are
 * applied here rather than by the handler so the ranking a caller sees is a
 * property of the read, not of whoever consumed it.
 */
import { desc, sql } from 'drizzle-orm';

import { accounts, transactions } from '../schema.js';
import {
  ROW_COUNT,
  SPEND_CENTS,
  shareOfTotal,
  spendWithinRange,
  toMeasure,
  withinRange,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

export interface AccountSpend {
  accountId: string;
  /** `null` when the ledger row points at an account row that no longer exists. */
  accountName: string | null;
  currency: string | null;
  archived: boolean;
  spend: SpendMeasure;
  shareOfTotal: number | null;
}

export interface MonthAccountSpend {
  accountId: string;
  spend: SpendMeasure;
}

export interface MonthSpend {
  /** `YYYY-MM`. */
  month: string;
  spend: SpendMeasure;
  byAccount: MonthAccountSpend[];
}

export function totalSpend(db: FinanceDb, range: SummaryRange): SpendMeasure {
  return toMeasure(
    db.all<{ cents: number | null; transactionCount: number | null }>(sql`
      SELECT ${SPEND_CENTS} AS cents, ${ROW_COUNT} AS transactionCount
      FROM ${transactions} WHERE ${spendWithinRange(range)}
    `)[0]
  );
}

/** Every transaction in the window, spend or not — what `empty` is decided on. */
export function transactionsInRange(db: FinanceDb, range: SummaryRange): number {
  return (
    db.all<{ n: number | null }>(sql`
      SELECT ${ROW_COUNT} AS n FROM ${transactions} WHERE ${withinRange(range)}
    `)[0]?.n ?? 0
  );
}

/** Oldest ledger date, or `null` on an empty ledger — the `all` window's floor. */
export function earliestTransactionDate(db: FinanceDb): string | null {
  return (
    db.all<{ date: string | null }>(sql`
      SELECT MIN(${transactions.date}) AS date FROM ${transactions}
    `)[0]?.date ?? null
  );
}

interface AccountSpendRow {
  accountId: string;
  accountName: string | null;
  currency: string | null;
  archivedAt: string | null;
  cents: number | null;
  transactionCount: number | null;
}

export function spendByAccount(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number
): AccountSpend[] {
  const rows = db.all<AccountSpendRow>(sql`
    SELECT ${transactions.accountId} AS accountId,
           ${accounts.name} AS accountName,
           ${accounts.currency} AS currency,
           ${accounts.archivedAt} AS archivedAt,
           ${SPEND_CENTS} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    LEFT JOIN ${accounts} ON ${accounts.id} = ${transactions.accountId}
    WHERE ${spendWithinRange(range)}
    GROUP BY ${transactions.accountId}
    ORDER BY ${desc(SPEND_CENTS)}, ${transactions.accountId}
  `);

  return rows.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    currency: row.currency,
    archived: row.archivedAt !== null,
    spend: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}

interface MonthRow {
  month: string;
  accountId: string;
  cents: number | null;
  transactionCount: number | null;
}

/**
 * Spend per month, stacked by account. `months` is supplied dense by the
 * caller so a month with no spend is a zero bar rather than a missing one.
 */
export function spendByMonth(
  db: FinanceDb,
  range: SummaryRange,
  months: readonly string[]
): MonthSpend[] {
  const rows = db.all<MonthRow>(sql`
    SELECT substr(${transactions.date}, 1, 7) AS month,
           ${transactions.accountId} AS accountId,
           ${SPEND_CENTS} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${spendWithinRange(range)}
    GROUP BY month, ${transactions.accountId}
    ORDER BY month, ${transactions.accountId}
  `);

  const byMonth = new Map<string, MonthSpend>(
    months.map((month) => [
      month,
      { month, spend: { cents: 0, transactionCount: 0 }, byAccount: [] },
    ])
  );

  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (entry === undefined) continue;
    const spend = toMeasure(row);
    entry.spend.cents += spend.cents;
    entry.spend.transactionCount += spend.transactionCount;
    entry.byAccount.push({ accountId: row.accountId, spend });
  }

  return months.flatMap((month) => byMonth.get(month) ?? []);
}
