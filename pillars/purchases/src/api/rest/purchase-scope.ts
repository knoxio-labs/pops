/**
 * One reading of the scope vocabulary, shared by the order index and the
 * merchant roll-up.
 *
 * The two routes take the same parameters and must select the same orders
 * from them — that identity is what lets a merchant row be opened. Reading
 * the query twice would be two chances to disagree, and the disagreement
 * would show up as a drill-down whose row count does not match the headline
 * it was opened from.
 */
import {
  MERCHANT_FILTER_PARAMETERS,
  resolveMerchantFilter,
} from '../../contract/merchant-filter.js';

import type { z } from 'zod';

import type { ListPurchasesQuerySchema } from '../../contract/rest-schemas.js';
import type { PurchaseScopeFilter } from '../../db/index.js';
import type { ErrorBody } from './error-mapping.js';

export type PurchaseScopeQuery = Omit<z.infer<typeof ListPurchasesQuerySchema>, 'limit' | 'offset'>;

export type PurchaseScopeResolution =
  | { readonly ok: true; readonly scope: PurchaseScopeFilter }
  | { readonly ok: false; readonly body: ErrorBody };

export function resolvePurchaseScope(query: PurchaseScopeQuery): PurchaseScopeResolution {
  const merchant = resolveMerchantFilter(query);
  if (!merchant.ok) {
    return {
      ok: false,
      body: {
        message: `A read is scoped to at most one merchant, but ${merchant.conflicting.join(
          ' and '
        )} were both sent. Send one of ${MERCHANT_FILTER_PARAMETERS.join(', ')}.`,
        code: 'MERCHANT_FILTER_CONFLICT',
      },
    };
  }

  return {
    ok: true,
    scope: {
      sources: query.sources,
      statuses: query.statuses,
      from: query.from,
      to: query.to,
      currency: query.currency,
      merchant: merchant.merchant,
    },
  };
}
