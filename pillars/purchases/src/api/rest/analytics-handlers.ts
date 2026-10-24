/**
 * Handlers for the `analytics.*` ts-rest sub-router.
 *
 * Thin on purpose: each fold lives in its own `db/services` module so the
 * accounting identity and the product-grouping rule each have one home, and
 * this only widens the service layer's `readonly` arrays into the mutable
 * ones ts-rest's response types expect.
 */
import { monthSummary, rankProductPurchases, rollUpMerchantSpend } from '../../db/index.js';
import {
  resolveMerchantIdentities,
  type CanonicalMerchantResolver,
} from '../contacts/canonical.js';
import { canonicalMerchantScope } from './canonical-merchant-scope.js';
import { resolvePurchaseScope } from './purchase-scope.js';

import type { z } from 'zod';

import type {
  MerchantSpendQuerySchema,
  MonthSummaryQuerySchema,
  ProductLeaderboardQuerySchema,
} from '../../contract/rest-analytics.js';
import type { PurchasesDb } from '../../db/index.js';

type MerchantSpendQuery = z.infer<typeof MerchantSpendQuerySchema>;
type ProductLeaderboardQuery = z.infer<typeof ProductLeaderboardQuerySchema>;
type MonthSummaryQuery = z.infer<typeof MonthSummaryQuerySchema>;

/** Builds aggregate reads that require an authoritative Contacts identity snapshot. */
export function makeAnalyticsHandlers(
  db: PurchasesDb,
  resolve: CanonicalMerchantResolver = resolveMerchantIdentities
) {
  return {
    merchantSpend: async ({ query }: { query: MerchantSpendQuery }) => {
      const scope = resolvePurchaseScope(query);
      if (!scope.ok) return { status: 400 as const, body: scope.body };

      const canonical = await canonicalMerchantScope(db, scope.scope, resolve);
      if (!canonical.ok) return canonical.response;
      const rollup = rollUpMerchantSpend(db, canonical.scope);

      return {
        status: 200 as const,
        body: {
          period: { from: query.from ?? null, to: query.to ?? null },
          merchants: rollup.merchants.map((entry) => ({ ...entry })),
          totals: rollup.totals.map((entry) => ({ ...entry })),
        },
      };
    },

    productLeaderboard: async ({ query }: { query: ProductLeaderboardQuery }) => {
      const scope = resolvePurchaseScope(query);
      if (!scope.ok) return { status: 400 as const, body: scope.body };

      const canonical = await canonicalMerchantScope(db, scope.scope, resolve);
      if (!canonical.ok) return canonical.response;
      const minOrderCount = query.minOrderCount ?? 1;
      const leaderboard = rankProductPurchases(db, { ...canonical.scope, minOrderCount });

      return {
        status: 200 as const,
        body: {
          period: { from: query.from ?? null, to: query.to ?? null },
          minOrderCount,
          products: leaderboard.products.map((entry) => ({
            ...entry,
            merchants: entry.merchants.map((merchant) => ({ ...merchant })),
          })),
          coverage: { ...leaderboard.coverage },
        },
      };
    },

    monthSummary: async ({ query }: { query: MonthSummaryQuery }) => {
      const canonical = await canonicalMerchantScope(db, {}, resolve);
      if (!canonical.ok) return canonical.response;
      const summary = monthSummary(db, query.month, canonical.scope.canonicalMerchants);

      return {
        status: 200 as const,
        body: {
          month: summary.month,
          totals: summary.totals.map((entry) => ({ ...entry })),
          purchaseCount: summary.purchaseCount,
          previousMonthTotals:
            summary.previousMonthTotals === null
              ? null
              : summary.previousMonthTotals.map((entry) => ({ ...entry })),
          unmatchedCount: summary.unmatchedCount,
          merchantLeaders: summary.merchantLeaders.map((entry) => ({ ...entry })),
        },
      };
    },
  };
}
