/**
 * The shared SQL vocabulary every summary aggregation is built from
 * (POPS-3589), kept in one file so "what counts as spend, over what dates"
 * has exactly one definition.
 *
 * Spend is `SUM(-amount_cents)` over {@link SPEND_TRANSACTION_TYPES} — net, so
 * a refund subtracts. That is what the type set already promises: a positive
 * `refund` is documented as "an expense offset, not income"
 * (`corrections-constants.ts`), and a refund that offsets nothing is a refund
 * that may as well not be in the set. Budget spend clamps the same expression
 * at zero per row, which makes refunds inert there; the divergence is
 * deliberate and tracked, not an accident of this file.
 */
import { and, sql, type SQL } from 'drizzle-orm';

import { SPEND_TRANSACTION_TYPES } from '../../contract/corrections-constants.js';
import { transactions } from '../schema.js';

/** An inclusive date range with an optional open lower bound (`all`). */
export interface SummaryRange {
  start: string | null;
  end: string;
}

/** Cents plus the row count behind them. */
export interface SpendMeasure {
  cents: number;
  /**
   * How many ledger rows the cents were measured from. `0` means nothing
   * matched — the caller must render that as "no data", never as `$0.00`,
   * because the two are different claims (POPS-250).
   */
  transactionCount: number;
}

export const EMPTY_MEASURE: SpendMeasure = { cents: 0, transactionCount: 0 };

/** `SUM(-amount_cents)` — the ledger stores outgoings negative. */
export const SPEND_CENTS = sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`;

export const ROW_COUNT = sql<number>`COUNT(*)`;

const SPEND_TYPES = sql`${transactions.type} IN (${sql.join(
  SPEND_TRANSACTION_TYPES.map((type) => sql`${type}`),
  sql`, `
)})`;

/** Date bounds alone — no type filter, for "is this window empty at all". */
export function withinRange(range: SummaryRange): SQL {
  const conditions: SQL[] = [sql`${transactions.date} <= ${range.end}`];
  if (range.start !== null) conditions.push(sql`${transactions.date} >= ${range.start}`);
  return and(...conditions) ?? sql`1 = 1`;
}

/** Date bounds plus the spend type filter — the predicate every total uses. */
export function spendWithinRange(range: SummaryRange): SQL {
  return and(SPEND_TYPES, withinRange(range)) ?? sql`1 = 1`;
}

interface MeasureRow {
  cents: number | null;
  transactionCount: number | null;
}

export function toMeasure(row: MeasureRow | undefined): SpendMeasure {
  return { cents: row?.cents ?? 0, transactionCount: row?.transactionCount ?? 0 };
}

/**
 * A breakdown row's share of the window total, or `null` when the total is
 * zero. A share of a zero total is undefined, not `0` — reporting `0` would
 * claim the row contributed nothing to a total it may be the whole of.
 */
export function shareOfTotal(cents: number, totalCents: number): number | null {
  return totalCents === 0 ? null : cents / totalCents;
}
