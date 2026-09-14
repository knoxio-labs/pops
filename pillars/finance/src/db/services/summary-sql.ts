/**
 * The shared SQL vocabulary every summary aggregation is built from
 * (POPS-3589), kept in one file so "what counts as spend, or as income, over
 * what dates" has exactly one definition.
 *
 * Spend is `SUM(-amount_cents)` over {@link SPEND_TRANSACTION_TYPES} — net, so
 * a refund subtracts. That is what the type set already promises: a positive
 * `refund` is documented as "an expense offset, not income"
 * (`corrections-constants.ts`), and a refund that offsets nothing is a refund
 * that may as well not be in the set. Budget spend clamps the same expression
 * at zero per row, which makes refunds inert there; the divergence is
 * deliberate and tracked, not an accident of this file.
 *
 * Income is `SUM(amount_cents)` over {@link INCOME_TRANSACTION_TYPES}, signed
 * the same way for the mirror reason: a negative income row is a clawback and
 * reduces the total rather than being dropped.
 */
import { and, sql, type SQL } from 'drizzle-orm';

import {
  INCOME_TRANSACTION_TYPES,
  SPEND_TRANSACTION_TYPES,
  type TransactionType,
} from '../../contract/corrections-constants.js';
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

/** What a total sums, and which transaction types it sums it over. */
export interface LedgerMeasure {
  cents: SQL<number>;
  types: readonly TransactionType[];
}

export const EMPTY_MEASURE: SpendMeasure = { cents: 0, transactionCount: 0 };

/** The ledger stores outgoings negative, so spend negates. */
export const SPEND: LedgerMeasure = {
  cents: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`,
  types: SPEND_TRANSACTION_TYPES,
};

export const INCOME: LedgerMeasure = {
  cents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
  types: INCOME_TRANSACTION_TYPES,
};

export const SPEND_CENTS = SPEND.cents;

export const ROW_COUNT = sql<number>`COUNT(*)`;

/** Date bounds alone — no type filter, for "is this window empty at all". */
export function withinRange(range: SummaryRange): SQL {
  const conditions: SQL[] = [sql`${transactions.date} <= ${range.end}`];
  if (range.start !== null) conditions.push(sql`${transactions.date} >= ${range.start}`);
  return and(...conditions) ?? sql`1 = 1`;
}

/** Date bounds plus the measure's type filter — the predicate every total uses. */
export function measureWithinRange(measure: LedgerMeasure, range: SummaryRange): SQL {
  const types = sql`${transactions.type} IN (${sql.join(
    measure.types.map((type) => sql`${type}`),
    sql`, `
  )})`;
  return and(types, withinRange(range)) ?? sql`1 = 1`;
}

export function spendWithinRange(range: SummaryRange): SQL {
  return measureWithinRange(SPEND, range);
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

export interface MeasureComparison {
  /** `null` for the `all` window, which has no period before it. */
  previousTotal: SpendMeasure | null;
  /** `total - previousTotal`, or `null` when there is no previous period. */
  deltaCents: number | null;
  /** Fractional change against the previous period; `null` when it was zero. */
  deltaRatio: number | null;
}

export function compareMeasures(
  total: SpendMeasure,
  previousTotal: SpendMeasure | null
): MeasureComparison {
  return {
    previousTotal,
    deltaCents: previousTotal === null ? null : total.cents - previousTotal.cents,
    deltaRatio:
      previousTotal === null || previousTotal.cents === 0
        ? null
        : (total.cents - previousTotal.cents) / Math.abs(previousTotal.cents),
  };
}
