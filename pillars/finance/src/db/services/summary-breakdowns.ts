/**
 * The summary endpoint's grouped reads (POPS-3589): the window total, and
 * a measure split by account and by month. The label-keyed breakdowns — by tag
 * and by entity — live in `summary-facets.ts`.
 *
 * Each is one grouped query over the ledger, generic over the
 * {@link LedgerMeasure} it sums so spend and income cannot drift apart.
 * Ordering and share-of-total are applied here rather than by the handler so
 * the ranking a caller sees is a property of the read, not of whoever
 * consumed it.
 */
import { desc, sql } from 'drizzle-orm';

import { accounts, transactions } from '../schema.js';
import {
  ROW_COUNT,
  SPEND,
  measureWithinRange,
  shareOfTotal,
  toMeasure,
  withinRange,
  type LedgerMeasure,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

interface AccountFacts {
  accountId: string;
  /** `null` when the ledger row points at an account row that no longer exists. */
  accountName: string | null;
  currency: string | null;
  archived: boolean;
  shareOfTotal: number | null;
}

export interface AccountAmount extends AccountFacts {
  amount: SpendMeasure;
}

export interface AccountSpend extends AccountFacts {
  spend: SpendMeasure;
}

export interface MonthAmount {
  /** `YYYY-MM`. */
  month: string;
  amount: SpendMeasure;
  byAccount: { accountId: string; amount: SpendMeasure }[];
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

export function measureTotal(
  db: FinanceDb,
  measure: LedgerMeasure,
  range: SummaryRange
): SpendMeasure {
  return toMeasure(
    db.all<{ cents: number | null; transactionCount: number | null }>(sql`
      SELECT ${measure.cents} AS cents, ${ROW_COUNT} AS transactionCount
      FROM ${transactions} WHERE ${measureWithinRange(measure, range)}
    `)[0]
  );
}

export function totalSpend(db: FinanceDb, range: SummaryRange): SpendMeasure {
  return measureTotal(db, SPEND, range);
}

/** Every transaction in the window, of any type — what `empty` is decided on. */
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

interface AccountRow {
  accountId: string;
  accountName: string | null;
  currency: string | null;
  archivedAt: string | null;
  cents: number | null;
  transactionCount: number | null;
}

export function accountAmounts(
  db: FinanceDb,
  measure: LedgerMeasure,
  range: SummaryRange,
  totalCents: number
): AccountAmount[] {
  const rows = db.all<AccountRow>(sql`
    SELECT ${transactions.accountId} AS accountId,
           ${accounts.name} AS accountName,
           ${accounts.currency} AS currency,
           ${accounts.archivedAt} AS archivedAt,
           ${measure.cents} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    LEFT JOIN ${accounts} ON ${accounts.id} = ${transactions.accountId}
    WHERE ${measureWithinRange(measure, range)}
    GROUP BY ${transactions.accountId}
    ORDER BY ${desc(measure.cents)}, ${transactions.accountId}
  `);

  return rows.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    currency: row.currency,
    archived: row.archivedAt !== null,
    amount: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}

export function spendByAccount(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number
): AccountSpend[] {
  return accountAmounts(db, SPEND, range, totalCents).map(({ amount, ...account }) => ({
    ...account,
    spend: amount,
  }));
}

interface MonthRow {
  month: string;
  accountId: string;
  cents: number | null;
  transactionCount: number | null;
}

/**
 * A measure per month, stacked by account. `months` is supplied dense by the
 * caller so a month with nothing in it is a zero bar rather than a missing one.
 */
export function monthAmounts(
  db: FinanceDb,
  measure: LedgerMeasure,
  range: SummaryRange,
  months: readonly string[]
): MonthAmount[] {
  const rows = db.all<MonthRow>(sql`
    SELECT substr(${transactions.date}, 1, 7) AS month,
           ${transactions.accountId} AS accountId,
           ${measure.cents} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${measureWithinRange(measure, range)}
    GROUP BY month, ${transactions.accountId}
    ORDER BY month, ${transactions.accountId}
  `);

  const byMonth = new Map<string, MonthAmount>(
    months.map((month) => [
      month,
      { month, amount: { cents: 0, transactionCount: 0 }, byAccount: [] },
    ])
  );

  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (entry === undefined) continue;
    const amount = toMeasure(row);
    entry.amount.cents += amount.cents;
    entry.amount.transactionCount += amount.transactionCount;
    entry.byAccount.push({ accountId: row.accountId, amount });
  }

  return months.flatMap((month) => byMonth.get(month) ?? []);
}

export function spendByMonth(
  db: FinanceDb,
  range: SummaryRange,
  months: readonly string[]
): MonthSpend[] {
  return monthAmounts(db, SPEND, range, months).map((row) => ({
    month: row.month,
    spend: row.amount,
    byAccount: row.byAccount.map(({ accountId, amount }) => ({ accountId, spend: amount })),
  }));
}
