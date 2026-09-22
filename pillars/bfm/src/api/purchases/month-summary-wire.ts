/**
 * The month-summary shape bfm reads from `purchases`, and its mapping to
 * the mobile month-summary record. Split out of `list-wire.ts` to keep
 * that file under the line-count cap; no behaviour changed by the split.
 */
import { z } from 'zod';

import type { MobileMonthMerchantLeader, MobileMonthSummary } from '../../contract/rest-schemas.js';

/**
 * One currency's spend, as `purchases`' month-summary route serves it.
 *
 * Only `totalCents` and `netSpendCents` are read out of the six-figure
 * accounting split: the phone's month figure and its home-screen headline
 * are the two spend numbers, not the settlement breakdown behind them.
 */
const MonthCurrencyTotalSchema = z.object({
  currency: z.string(),
  orderCount: z.number().int().min(0),
  accounting: z.object({
    totalCents: z.number().int(),
    netSpendCents: z.number().int(),
  }),
});

const MonthMerchantLeaderSchema = z.object({
  merchant: z.object({
    resolution: z.enum(['entity', 'name', 'unattributed']),
    entityId: z.string().nullable(),
    name: z.string().nullable(),
  }),
  currency: z.string(),
  netSpendCents: z.number().int(),
  orderCount: z.number().int().min(0),
});

/** `purchases`' `GET /analytics/month-summary` response. */
export const PurchasesMonthSummaryResponseSchema = z.object({
  month: z.string(),
  totals: z.array(MonthCurrencyTotalSchema),
  purchaseCount: z.number().int().min(0),
  previousMonthTotals: z.array(MonthCurrencyTotalSchema).nullable(),
  unmatchedCount: z.number().int().min(0),
  merchantLeaders: z.array(MonthMerchantLeaderSchema),
});

export type PurchasesMonthSummaryResponse = z.infer<typeof PurchasesMonthSummaryResponseSchema>;

function toMobileMonthCurrencyTotal(
  total: z.infer<typeof MonthCurrencyTotalSchema>
): MobileMonthSummary['totals'][number] {
  return {
    currency: total.currency,
    orderCount: total.orderCount,
    totalCents: total.accounting.totalCents,
    netSpendCents: total.accounting.netSpendCents,
  };
}

function toMobileMonthMerchantLeader(
  leader: z.infer<typeof MonthMerchantLeaderSchema>
): MobileMonthMerchantLeader {
  return {
    merchantName: leader.merchant.name,
    currency: leader.currency,
    netSpendCents: leader.netSpendCents,
    orderCount: leader.orderCount,
  };
}

/** `purchases`' month summary → the mobile month summary record. */
export function toMobileMonthSummary(summary: PurchasesMonthSummaryResponse): MobileMonthSummary {
  return {
    month: summary.month,
    totals: summary.totals.map(toMobileMonthCurrencyTotal),
    purchaseCount: summary.purchaseCount,
    previousMonthTotals:
      summary.previousMonthTotals === null
        ? null
        : summary.previousMonthTotals.map(toMobileMonthCurrencyTotal),
    unmatchedCount: summary.unmatchedCount,
    merchantLeaders: summary.merchantLeaders.map(toMobileMonthMerchantLeader),
  };
}
