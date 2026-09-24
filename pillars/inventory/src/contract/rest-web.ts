/**
 * Web read endpoints (Inventory ADR-002, POPS-3329, delivery slice D1): a
 * cursor-paged, filtered item catalogue and a single item's detail with its
 * history, on the new item model — as distinct from the legacy `items.*`
 * offset-paginated surface (`rest-items.ts`) that predates the type
 * catalogue and the command layer, and from the mobile-oriented sync
 * protocol (`rest-sync.ts`), which pages the *whole* live catalogue rather
 * than a filtered slice and requires the `Pops-Inventory-Protocol` header
 * this surface does not.
 *
 * Cursors are opaque base64url strings the caller echoes unmodified,
 * ordered by item id — inserting a row anywhere in the id order never
 * reshuffles a page already served, so a page fetched before an insert and
 * one fetched after agree on every row they both cover.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, NonEmptyString, QueryBool } from './rest-schemas.js';
import { SyncEventSchema, SyncItemSchema } from './rest-sync-schemas.js';

const c = initContract();

/** Where an item sits, mirroring `PLACEMENT_KINDS` (`db/schema/items.ts`). */
export const WEB_PLACEMENT_KINDS = ['location', 'container', 'hand'] as const;

/** The most items one `ids` filter may name; a page of labels, not a catalogue export. */
export const WEB_ITEMS_MAX_IDS = 200;

const IdList = z
  .string()
  .regex(/^[^,\s]+(,[^,\s]+)*$/, 'a comma-separated list of item ids')
  .refine((value) => value.split(',').length <= WEB_ITEMS_MAX_IDS, {
    message: `at most ${WEB_ITEMS_MAX_IDS} ids`,
  });

const WebItemsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  typeKey: z.string().optional(),
  placementKind: z.enum(WEB_PLACEMENT_KINDS).optional(),
  locationId: z.string().optional(),
  containingItemId: z.string().optional(),
  /** Only these items, as comma-separated ids (at most 200); combines with every other filter. */
  ids: IdList.optional(),
  /** Active items only unless `true` (Inventory ADR-002: "excluded from … search unless Include inactive is on"). */
  includeInactive: QueryBool.optional(),
});

const WebItemsResponse = z.object({
  items: z.array(SyncItemSchema),
  nextCursor: z.string().nullable(),
});

const WebItemHistorySchema = z.object({
  events: z.array(SyncEventSchema),
  nextCursor: z.string().nullable(),
});

const WebItemDetailResponse = z.object({
  item: SyncItemSchema,
  history: WebItemHistorySchema,
});

export const inventoryWebContract = c.router({
  list: {
    method: 'GET',
    path: '/web/items',
    query: WebItemsQuery,
    responses: { 200: WebItemsResponse, 400: ErrorBodySchema },
    summary: 'A cursor-paged, filtered slice of the live item catalogue, on the new item model',
  },
  get: {
    method: 'GET',
    path: '/web/items/:id',
    pathParams: z.object({ id: NonEmptyString }),
    query: z.object({
      historyCursor: z.string().optional(),
      historyLimit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    responses: { 200: WebItemDetailResponse, 400: ErrorBodySchema, 404: ErrorBodySchema },
    summary: 'An item, and one page of its history, newest first',
  },
});
