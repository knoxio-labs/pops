/**
 * One reading of the scope vocabulary, shared by the order index and the
 * merchant roll-up.
 *
 * The two routes take the same parameters and must select the same orders
 * from them — that identity is what lets a merchant row be opened. Reading
 * the query twice would be two chances to disagree, and the disagreement
 * would show up as a drill-down whose row count does not match the headline
 * it was opened from.
 *
 * A window bound is read here too, and a bound naming no instant is refused
 * with the request rather than carried into a predicate. `IsoTimestampSchema`
 * closes the shape and the calendar range, so an impossible date is already a
 * `400` from the contract; what it does not close is the offset range, so
 * `+99:00` still reaches a handler. Compared as text against a canonical
 * column such a bound would answer `200` over a window nobody asked for,
 * which is the one thing a filter must never do. `POST /search` refuses the
 * same values, so the two hold one rule about which timestamps are legal.
 */
import {
  MERCHANT_FILTER_PARAMETERS,
  resolveMerchantFilter,
} from '../../contract/merchant-filter.js';
import { canonicalInstant } from '../../db/index.js';

import type { z } from 'zod';

import type { ListPurchasesQuerySchema } from '../../contract/rest-schemas.js';
import type { PurchaseScopeFilter } from '../../db/index.js';
import type { ErrorBody } from './error-mapping.js';

export type PurchaseScopeQuery = Omit<z.infer<typeof ListPurchasesQuerySchema>, 'limit' | 'offset'>;

export type PurchaseScopeResolution =
  | { readonly ok: true; readonly scope: PurchaseScopeFilter }
  | { readonly ok: false; readonly body: ErrorBody };

type BoundReading =
  | { readonly ok: true; readonly bound: string | undefined }
  | { readonly ok: false; readonly body: ErrorBody };

function readBound(parameter: 'from' | 'to', value: string | undefined): BoundReading {
  if (value === undefined) return { ok: true, bound: undefined };
  const bound = canonicalInstant(value);
  if (bound === null) {
    return {
      ok: false,
      body: {
        message: `Scope parameter '${parameter}' value '${value}' names no instant`,
        code: 'UNREADABLE_TIMESTAMP',
      },
    };
  }
  return { ok: true, bound };
}

export function resolvePurchaseScope(query: PurchaseScopeQuery): PurchaseScopeResolution {
  const from = readBound('from', query.from);
  if (!from.ok) return { ok: false, body: from.body };
  const to = readBound('to', query.to);
  if (!to.ok) return { ok: false, body: to.body };

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
      from: from.bound,
      to: to.bound,
      currency: query.currency,
      merchant: merchant.merchant,
    },
  };
}
