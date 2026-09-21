/**
 * The home screen's month figure — a summary of one calendar month, built on
 * top of `rollUpMerchantSpend` and `countPurchases` rather than a third fold
 * over orders, so the merchant leaders on this screen and the merchant page
 * they drill into can never disagree about a total.
 *
 * The window is a calendar month in the owner's timezone, not UTC — see
 * `month-window.ts` for why that boundary needs the zone at all.
 */
import { rollUpMerchantSpend, type CurrencySpend } from './merchant-spend.js';
import { monthBounds, previousMonthKey } from './month-window.js';
import { countPurchases } from './purchase-count.js';

import type { PurchasesDb } from './internal.js';
import type { MerchantIdentity } from './merchant-identity.js';

/**
 * `awaiting_settlement`/`partial` — the pair the phone's unmatched strip and
 * archive scope mean by "unsettled" (POPS-3710). Purchases' own copy: bfm
 * keeps a separate one on its side of the wire rather than importing this,
 * because a mobile concept importing a producer's internal vocabulary is
 * the coupling POPS-3868 avoids in the other direction.
 */
const UNMATCHED_STATUSES = ['awaiting_settlement', 'partial'] as const;

/** Merchant leaders shown per currency, most-spent first. */
const LEADER_LIMIT_PER_CURRENCY = 5;

/** One merchant's spend in one currency, as a leaderboard row. */
export interface MonthMerchantLeader {
  readonly merchant: MerchantIdentity;
  readonly currency: string;
  readonly netSpendCents: number;
  readonly orderCount: number;
}

export interface MonthSummary {
  /** The `YYYY-MM` this summary answers for. */
  readonly month: string;
  /** Never one cross-currency figure — see `rest-analytics.ts` on why. */
  readonly totals: readonly CurrencySpend[];
  /** Orders placed in the month, across every currency. */
  readonly purchaseCount: number;
  /** `null` when the previous month has no orders at all, not an empty array. */
  readonly previousMonthTotals: readonly CurrencySpend[] | null;
  /** Orders in the month still `awaiting_settlement` or `partial`. */
  readonly unmatchedCount: number;
  /** Currency ascending, then net spend descending, capped per currency. */
  readonly merchantLeaders: readonly MonthMerchantLeader[];
}

function topLeadersPerCurrency(
  merchants: readonly {
    merchant: MerchantIdentity;
    currency: string;
    accounting: { netSpendCents: number };
    orderCount: number;
  }[]
): readonly MonthMerchantLeader[] {
  const seenPerCurrency = new Map<string, number>();
  const leaders: MonthMerchantLeader[] = [];
  // `rollUpMerchantSpend` already sorts currency ascending, then net spend
  // descending, so taking the first N seen per currency IS the top N.
  for (const entry of merchants) {
    const seen = seenPerCurrency.get(entry.currency) ?? 0;
    if (seen >= LEADER_LIMIT_PER_CURRENCY) continue;
    seenPerCurrency.set(entry.currency, seen + 1);
    leaders.push({
      merchant: entry.merchant,
      currency: entry.currency,
      netSpendCents: entry.accounting.netSpendCents,
      orderCount: entry.orderCount,
    });
  }
  return leaders;
}

/**
 * The home screen's figures for one calendar month.
 *
 * `month` must already be a `YYYY-MM` string; the REST layer validates the
 * wire format before this is reached, the same way it does for every other
 * bound this pillar reads.
 */
export function monthSummary(db: PurchasesDb, month: string): MonthSummary {
  const bounds = monthBounds(month);
  const rollup = rollUpMerchantSpend(db, bounds);
  const purchaseCount = countPurchases(db, bounds);
  const unmatchedCount = countPurchases(db, { ...bounds, statuses: [...UNMATCHED_STATUSES] });

  const previousBounds = monthBounds(previousMonthKey(month));
  const previousRollup = rollUpMerchantSpend(db, previousBounds);

  return {
    month,
    totals: rollup.totals,
    purchaseCount,
    previousMonthTotals: previousRollup.totals.length === 0 ? null : previousRollup.totals,
    unmatchedCount,
    merchantLeaders: topLeadersPerCurrency(rollup.merchants),
  };
}
