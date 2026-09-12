/**
 * The dashboard/assistant spend summary (POPS-3589, POPS-250 decision 2).
 *
 * One read composing the grouped queries in `summary-breakdowns.ts` and the
 * panel reads in `summary-inference.ts`, so the browser never pages the ledger
 * to reduce it locally and the assistant never does the arithmetic in context.
 *
 * There is deliberately no income figure. The ledger holds zero `income` rows
 * and always has (POPS-250), so an income field would be a permanent `$0.00`
 * that reads as measured — the honest rendering of a category nothing has ever
 * been filed under is its absence, not a zero.
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
  concentration,
  foreignSpend,
  largestCharge,
  recurringSubscriptions,
  type Concentration,
  type ForeignSpend,
  type LargestCharge,
  type RecurringSubscriptions,
} from './summary-inference.js';
import { type SpendMeasure, type SummaryRange } from './summary-sql.js';
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

export interface FinanceSummary {
  window: ResolvedSummaryWindow;
  /**
   * The window holds no transactions of any type. Distinct from spend of
   * zero, which a window full of transfers legitimately produces.
   */
  empty: boolean;
  /**
   * Every currency the contributing accounts are denominated in. More than
   * one means `total` adds unlike units — the ledger has no conversion, so the
   * figure is reported with the fact rather than without it.
   */
  currencies: string[];
  total: SpendMeasure;
  /** `null` for the `all` window, which has no period before it. */
  previousTotal: SpendMeasure | null;
  /** `total - previousTotal`, or `null` when there is no previous period. */
  deltaCents: number | null;
  /** Fractional change against the previous period; `null` when it was zero. */
  deltaRatio: number | null;
  byAccount: AccountSpend[];
  byMonth: MonthSpend[];
  byTag: TagSpend[];
  byEntity: EntitySpend[];
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

function ratio(total: SpendMeasure, previous: SpendMeasure | null): number | null {
  if (previous === null || previous.cents === 0) return null;
  return (total.cents - previous.cents) / Math.abs(previous.cents);
}

/** Build the whole summary for one window. */
export function financeSummary(db: FinanceDb, options: SummaryOptions = {}): FinanceSummary {
  const window = resolveSummaryWindow(options.window ?? DEFAULT_SUMMARY_WINDOW, options.now);
  const topLimit = options.topLimit ?? DEFAULT_SUMMARY_TOP_LIMIT;
  const range: SummaryRange = { start: window.start, end: window.end };

  const total = totalSpend(db, range);
  const previousTotal = window.previous === null ? null : totalSpend(db, window.previous);
  const byAccount = spendByAccount(db, range, total.cents);

  return {
    window,
    empty: transactionsInRange(db, range) === 0,
    currencies: [...new Set(byAccount.flatMap((account) => account.currency ?? []))].toSorted(),
    total,
    previousTotal,
    deltaCents: previousTotal === null ? null : total.cents - previousTotal.cents,
    deltaRatio: ratio(total, previousTotal),
    byAccount,
    byMonth: spendByMonth(db, range, trendMonths(db, window)),
    byTag: spendByTag(db, range, total.cents, topLimit),
    byEntity: spendByEntity(db, range, total.cents, topLimit),
    inference: {
      largestCharge: largestCharge(db, range),
      concentration: concentration(db, range, total.cents),
      recurringSubscriptions: recurringSubscriptions(db, range),
      foreign: foreignSpend(db, range),
    },
  };
}
