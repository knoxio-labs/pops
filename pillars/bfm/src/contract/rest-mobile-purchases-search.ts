/**
 * `searchPurchases` and `purchaseTags`'s route literals, spread into
 * `mobilePurchasesContract` in `rest.ts`.
 *
 * Split out purely to keep `rest.ts` under the line-count cap, on the same
 * reasoning `mobile-purchases-schemas.ts` holds this screen's wire shapes
 * instead of `rest-schemas.ts`. A plain object rather than its own
 * `c.router({...})`: `mobilePurchasesContract` spreads this in at the same
 * depth its own routes sit at, and a nested router here would put these two
 * paths one segment deeper than `/mobile/purchases/*` actually serves them.
 */
import { requires } from './capabilities.js';
import {
  MobilePurchaseSearchResponseSchema,
  MobilePurchaseTagsResponseSchema,
  MobileSearchQuerySchema,
} from './mobile-purchases-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';

export const mobilePurchasesSearchRoutes = {
  // Declared ahead of `getPurchase` for the same reason `getMonthSummary` is
  // — see that route's comment in `rest.ts` on which file actually decides
  // the order.
  searchPurchases: {
    method: 'GET',
    path: '/mobile/purchases/search',
    query: MobileSearchQuerySchema,
    responses: {
      200: MobilePurchaseSearchResponseSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Search purchases and their line items by merchant, product name or item tag',
    metadata: requires('purchases.read'),
  },
  purchaseTags: {
    method: 'GET',
    path: '/mobile/purchases/tags',
    responses: {
      200: MobilePurchaseTagsResponseSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The item tag vocabulary in use, most-used first, for the search filter sheet',
    metadata: requires('purchases.read'),
  },
} as const;
