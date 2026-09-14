/**
 * The income half of the summary, and the net it leaves against spend
 * (POPS-3955).
 *
 * Income is measured by exactly the queries spend is, over the income types,
 * so a row typed `income` that is really a friend's repayment shows up here as
 * income. That is mistyped data to correct at the row, not something to
 * special-case in SQL.
 */
import {
  accountAmounts,
  measureTotal,
  monthAmounts,
  type AccountAmount,
  type MonthSpend,
} from './summary-breakdowns.js';
import { entityAmounts, type EntityAmount } from './summary-facets.js';
import {
  INCOME,
  compareMeasures,
  type MeasureComparison,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

export interface AccountIncome extends Omit<AccountAmount, 'amount'> {
  income: SpendMeasure;
}

export interface MonthIncome {
  /** `YYYY-MM`. */
  month: string;
  income: SpendMeasure;
  byAccount: { accountId: string; income: SpendMeasure }[];
}

/** An entity that paid in — the payer, where the spend side has the merchant. */
export interface EntityIncome extends Omit<EntityAmount, 'amount'> {
  income: SpendMeasure;
}

export interface IncomeSummary extends MeasureComparison {
  total: SpendMeasure;
  byAccount: AccountIncome[];
  byMonth: MonthIncome[];
  byEntity: EntityIncome[];
}

/**
 * Income minus spend, in cents. Fees and transfers are in neither side. A net
 * of zero from two unmeasured sides is still zero here — whether anything was
 * measured is read off `income` and the spend total's row counts.
 */
export interface NetSummary {
  cents: number;
  /** `null` for the `all` window, which has no period before it. */
  previousCents: number | null;
  deltaCents: number | null;
  byMonth: { month: string; cents: number }[];
}

export interface IncomeQuery {
  range: SummaryRange;
  previous: SummaryRange | null;
  months: readonly string[];
  topLimit: number;
}

export function incomeSummary(db: FinanceDb, query: IncomeQuery): IncomeSummary {
  const total = measureTotal(db, INCOME, query.range);
  const previousTotal = query.previous === null ? null : measureTotal(db, INCOME, query.previous);

  return {
    total,
    ...compareMeasures(total, previousTotal),
    byAccount: accountAmounts(db, INCOME, query.range, total.cents).map(
      ({ amount, ...account }) => ({ ...account, income: amount })
    ),
    byMonth: monthAmounts(db, INCOME, query.range, query.months).map((row) => ({
      month: row.month,
      income: row.amount,
      byAccount: row.byAccount.map(({ accountId, amount }) => ({ accountId, income: amount })),
    })),
    byEntity: entityAmounts(db, INCOME, {
      range: query.range,
      totalCents: total.cents,
      limit: query.topLimit,
    }).map(({ amount, ...entity }) => ({ ...entity, income: amount })),
  };
}

export interface SpendSide {
  total: SpendMeasure;
  previousTotal: SpendMeasure | null;
  byMonth: readonly MonthSpend[];
}

export function netSummary(spend: SpendSide, income: IncomeSummary): NetSummary {
  const cents = income.total.cents - spend.total.cents;
  const previousCents =
    spend.previousTotal === null || income.previousTotal === null
      ? null
      : income.previousTotal.cents - spend.previousTotal.cents;
  const incomeByMonth = new Map(income.byMonth.map((row) => [row.month, row.income.cents]));

  return {
    cents,
    previousCents,
    deltaCents: previousCents === null ? null : cents - previousCents,
    byMonth: spend.byMonth.map((row) => ({
      month: row.month,
      cents: (incomeByMonth.get(row.month) ?? 0) - row.spend.cents,
    })),
  };
}
