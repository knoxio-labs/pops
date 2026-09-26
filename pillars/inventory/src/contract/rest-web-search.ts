/** The ranked inventory search surface used by the web application. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { SyncItemSchema } from './rest-sync-schemas.js';
import { StrictQueryBool } from './rest-web.js';

const c = initContract();

/** The item-match tiers returned by `GET /web/search`. */
export const WEB_SEARCH_TIERS = ['prefix', 'contains', 'other'] as const;

/** The non-name fields that can explain an item search hit. */
export const WEB_SEARCH_FIELDS = ['code', 'note', 'type', 'place'] as const;

const WebSearchItemHitSchema = z.object({
  item: SyncItemSchema,
  tier: z.enum(WEB_SEARCH_TIERS),
  field: z.enum(WEB_SEARCH_FIELDS).nullable(),
});

const WebSearchPlaceHitSchema = z.object({
  location: z.object({ id: z.string() }),
  tier: z.enum(['prefix', 'contains']),
});

/** The response body for `GET /web/search`. */
export const WebSearchResponseSchema = z.object({
  exact: SyncItemSchema.nullable(),
  items: z.array(WebSearchItemHitSchema),
  places: z.array(WebSearchPlaceHitSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});

/** The inventory web search REST router. */
export const inventoryWebSearchContract = c.router({
  list: {
    method: 'GET',
    path: '/web/search',
    query: z.object({
      q: z.string().trim().min(1).max(200),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      activeOnly: StrictQueryBool.optional(),
      typeKey: z.string().min(1).optional(),
      within: z.string().min(1).optional(),
    }),
    responses: { 200: WebSearchResponseSchema, 400: ErrorBodySchema },
    summary: 'Search live inventory items and places with ranked, cursor-paged results',
  },
});
