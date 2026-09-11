/**
 * Reading the order index's keyset anchor off the query.
 *
 * Separate from `purchase-scope.ts` because the anchor is a page concern, not
 * a scope one — `MerchantSpendQuerySchema` omits it for the same reason it
 * omits `limit`/`offset`, and `PurchaseScopeFilter` carries no page fields at
 * all. Folding this in with the scope reader would blur that line the two
 * types already draw.
 */
import { canonicalInstant } from '../../db/index.js';

import type { ErrorBody } from './error-mapping.js';

/** The two keyset-anchor query parameters, however `ListQuery` spells them. */
export interface PurchaseListKeysetQuery {
  readonly beforeOrderedAt?: string;
  readonly beforeId?: string;
}

export type PurchaseListKeysetResolution =
  | { readonly ok: true; readonly beforeOrderedAt?: string; readonly beforeId?: string }
  | { readonly ok: false; readonly body: ErrorBody };

/**
 * Validate and canonicalise the order index's `beforeOrderedAt`/`beforeId`
 * pair.
 *
 * Half a keyset anchor is rejected rather than ignored. Dropping it would
 * answer with page one of an unfiltered list — a plausible 200 that a paging
 * caller reads as "start again", re-showing rows it already has instead of
 * failing where the bug is.
 *
 * `beforeOrderedAt` is canonicalised the same way `from`/`to` are: compared
 * as text against a canonical column, an un-normalised bound would answer a
 * predicate nobody asked for rather than failing.
 */
export function resolvePurchaseListKeyset(
  query: PurchaseListKeysetQuery
): PurchaseListKeysetResolution {
  if ((query.beforeOrderedAt === undefined) !== (query.beforeId === undefined)) {
    const missing = query.beforeOrderedAt === undefined ? 'beforeOrderedAt' : 'beforeId';
    return {
      ok: false,
      body: {
        message: `beforeOrderedAt and beforeId must be supplied together; ${missing} is missing`,
        code: 'KEYSET_ANCHOR_INCOMPLETE',
      },
    };
  }

  if (query.beforeOrderedAt === undefined) return { ok: true };

  const beforeOrderedAt = canonicalInstant(query.beforeOrderedAt);
  if (beforeOrderedAt === null) {
    return {
      ok: false,
      body: {
        message: `Keyset anchor 'beforeOrderedAt' value '${query.beforeOrderedAt}' names no instant`,
        code: 'UNREADABLE_TIMESTAMP',
      },
    };
  }

  return { ok: true, beforeOrderedAt, beforeId: query.beforeId };
}
