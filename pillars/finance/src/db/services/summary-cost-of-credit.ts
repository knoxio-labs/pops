/** Cost of credit, measured over transaction-type fee rows. */
import {
  accountAmounts,
  measureTotal,
  monthAmounts,
  type AccountAmount,
} from './summary-breakdowns.js';
import { costOfCreditByTag, type TagCostOfCredit } from './summary-facets.js';
import {
  COST_OF_CREDIT,
  compareMeasures,
  type MeasureComparison,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

/** Fee measure for one account, retaining the account's currency and share. */
export interface AccountCostOfCredit extends Omit<AccountAmount, 'amount'> {
  fees: SpendMeasure;
}

/** Fee measure over one month, split by account on the same month axis. */
export interface MonthCostOfCredit {
  month: string;
  fees: SpendMeasure;
  byAccount: { accountId: string; fees: SpendMeasure }[];
}

/** Cost-of-credit totals and breakdowns for one summary window. */
export interface CostOfCreditSummary extends MeasureComparison {
  total: SpendMeasure;
  byAccount: AccountCostOfCredit[];
  byMonth: MonthCostOfCredit[];
  byTag: TagCostOfCredit[];
}

interface CostOfCreditQuery {
  range: SummaryRange;
  previous: SummaryRange | null;
  months: readonly string[];
  topLimit: number;
}

/** Build the cost-of-credit measure and its account, month and fee-tag facets. */
export function costOfCreditSummary(db: FinanceDb, query: CostOfCreditQuery): CostOfCreditSummary {
  const total = measureTotal(db, COST_OF_CREDIT, query.range);
  const previousTotal =
    query.previous === null ? null : measureTotal(db, COST_OF_CREDIT, query.previous);

  return {
    total,
    ...compareMeasures(total, previousTotal),
    byAccount: accountAmounts(db, COST_OF_CREDIT, query.range, total.cents).map(
      ({ amount, ...account }) => ({ ...account, fees: amount })
    ),
    byMonth: monthAmounts(db, COST_OF_CREDIT, query.range, query.months).map((row) => ({
      month: row.month,
      fees: row.amount,
      byAccount: row.byAccount.map(({ accountId, amount }) => ({ accountId, fees: amount })),
    })),
    byTag: costOfCreditByTag(db, query.range, total.cents, query.topLimit),
  };
}
