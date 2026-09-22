/**
 * `updatePurchase`'s route literal, spread into `mobilePurchasesContract` in
 * `rest.ts`.
 *
 * Split out purely to keep `rest.ts` under the line-count cap, on the same
 * reasoning `rest-mobile-purchases-search.ts` is its own file instead of a
 * case inline there.
 */
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobilePurchaseDetailSchema,
  MobileUpdatePurchaseBodySchema,
} from './mobile-purchases-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

export const mobilePurchasesUpdateRoute = {
  /**
   * Edit a purchase that is already saved (POPS-2458). Its own capability
   * (`purchases.edit`) apart from `purchases.write`: changing a record the
   * pillar already holds is not the same authority as creating one.
   * `409 upstream_conflict` covers both `purchase_locked` and
   * `purchase_stale`, and the pillar's own code — not the HTTP status alone
   * — is what tells them apart; a device without the capability never
   * reaches the pillar at all.
   */
  updatePurchase: {
    method: 'PATCH',
    path: '/mobile/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    body: MobileUpdatePurchaseBodySchema,
    responses: {
      200: MobilePurchaseDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      409: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Edit a saved purchase',
    metadata: requires('purchases.edit'),
  },
} as const;
