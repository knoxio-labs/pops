/**
 * The dashboard/assistant summary (POPS-3589, POPS-250 decision 2).
 *
 * One read composing the grouped queries in `summary-breakdowns.ts`, the
 * income and net in `summary-income.ts`, and the panel reads in
 * `summary-inference.ts`, so the browser never pages the ledger to reduce it
 * locally and the assistant never does the arithmetic in context.
 */
import {
  DEFAULT_SUMMARY_TOP_LIMIT,
  DEFAULT_SUMMARY_WINDOW,
  type SummaryWindowKey,
} from '../../contract/summary-windows.js';
import {
  earliestTransactionDate,
  spendByAccount,
  spendByMonth,
  totalSpend,
  transactionsInRange,
  type AccountSpend,
  type MonthSpend,
} from './summary-breakdowns.js';
import { spendByEntity, spendByTag, type EntitySpend, type TagSpend } from './summary-facets.js';
import {
  incomeSummary,
  netSummary,
  type IncomeSummary,
  type NetSummary,
} from './summary-income.js';
import {
  concentration,
  foreignSpend,
  largestCharge,
  recurringSubscriptions,
  type Concentration,
  type ForeignSpend,
  type LargestCharge,
  type RecurringSubscriptions,
} from './summary-inference.js';
import {
  compareMeasures,
  type MeasureComparison,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';
import {
  monthsInRange,
  resolveSummaryWindow,
  type ResolvedSummaryWindow,
} from './summary-window.js';

import type { FinanceDb } from './internal.js';

export interface SummaryOptions {
  window?: SummaryWindowKey;
  /** Rows returned in the tag and entity breakdowns. */
  topLimit?: number;
  /** Injected so the window arithmetic is testable at a month boundary. */
  now?: Date;
}

export interface SummaryInference {
  largestCharge: LargestCharge | null;
  concentration: Concentration;
  recurringSubscriptions: RecurringSubscriptions;
  foreign: ForeignSpend;
}

/** The top-level `total`/`previousTotal`/`delta*` fields are spend. */
export interface FinanceSummary extends MeasureComparison {
  window: ResolvedSummaryWindow;
  /**
   * The window holds no transactions of any type. Distinct from spend of
   * zero, which a window full of transfers legitimately produces.
   */
  empty: boolean;
  /**
   * Every currency the accounts behind spend or income are denominated in.
   * More than one means the totals add unlike units — the ledger has no
   * conversion, so the figure is reported with the fact rather than without it.
   */
  currencies: string[];
  total: SpendMeasure;
  byAccount: AccountSpend[];
  byMonth: MonthSpend[];
  byTag: TagSpend[];
  byEntity: EntitySpend[];
  income: IncomeSummary;
  net: NetSummary;
  inference: SummaryInference;
}

/**
 * The dense month axis for the trend panel. For `all` the axis starts at the
 * oldest ledger row; for an empty ledger there is no axis at all.
 */
function trendMonths(db: FinanceDb, window: ResolvedSummaryWindow): string[] {
  const start = window.start ?? earliestTransactionDate(db);
  if (start === null || start > window.end) return [];
  return monthsInRange({ start, end: window.end });
}

/** Build the whole summary for one window. */
export function financeSummary(db: FinanceDb, options: SummaryOptions = {}): FinanceSummary {
  const window = resolveSummaryWindow(options.window ?? DEFAULT_SUMMARY_WINDOW, options.now);
  const topLimit = options.topLimit ?? DEFAULT_SUMMARY_TOP_LIMIT;
  const range: SummaryRange = { start: window.start, end: window.end };
  const months = trendMonths(db, window);

  const total = totalSpend(db, range);
  const previousTotal = window.previous === null ? null : totalSpend(db, window.previous);
  const byAccount = spendByAccount(db, range, total.cents);
  const byMonth = spendByMonth(db, range, months);
  const income = incomeSummary(db, { range, previous: window.previous, months, topLimit });

  return {
    window,
    empty: transactionsInRange(db, range) === 0,
    currencies: [
      ...new Set([...byAccount, ...income.byAccount].flatMap((account) => account.currency ?? [])),
    ].toSorted(),
    total,
    ...compareMeasures(total, previousTotal),
    byAccount,
    byMonth,
    byTag: spendByTag(db, range, total.cents, topLimit),
    byEntity: spendByEntity(db, range, total.cents, topLimit),
    income,
    net: netSummary({ total, previousTotal, byMonth }, income),
    inference: {
      largestCharge: largestCharge(db, range),
      concentration: concentration(db, range, total.cents),
      recurringSubscriptions: recurringSubscriptions(db, range),
      foreign: foreignSpend(db, range),
    },
  };
}
