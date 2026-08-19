/**
 * Handlers for the `analytics.*` ts-rest sub-router.
 *
 * Thin on purpose: the fold lives in `db/services/merchant-spend.ts` so the
 * accounting identity has one home, and this only widens the service layer's
 * `readonly` arrays into the mutable ones ts-rest's response types expect.
 */
import { rollUpMerchantSpend } from '../../db/index.js';
import { resolvePurchaseScope } from './purchase-scope.js';

import type { z } from 'zod';

import type { MerchantSpendQuerySchema } from '../../contract/rest-analytics.js';
import type { PurchasesDb } from '../../db/index.js';

type MerchantSpendQuery = z.infer<typeof MerchantSpendQuerySchema>;

export function makeAnalyticsHandlers(db: PurchasesDb) {
  return {
    merchantSpend: async ({ query }: { query: MerchantSpendQuery }) => {
      const scope = resolvePurchaseScope(query);
      if (!scope.ok) return { status: 400 as const, body: scope.body };

      const rollup = rollUpMerchantSpend(db, scope.scope);

      return {
        status: 200 as const,
        body: {
          period: { from: query.from ?? null, to: query.to ?? null },
          merchants: rollup.merchants.map((entry) => ({ ...entry })),
          totals: rollup.totals.map((entry) => ({ ...entry })),
        },
      };
    },
  };
}
