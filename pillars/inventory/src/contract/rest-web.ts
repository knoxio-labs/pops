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

/** Sorts supported by the web item catalogue. An absent sort preserves id order. */
export const WEB_ITEMS_SORTS = ['name', 'updated', 'type', 'where', 'packing'] as const;
export type WebItemsSort = (typeof WEB_ITEMS_SORTS)[number];

/** Lifecycle values understood by the web item catalogue. */
export const WEB_LIFECYCLES = ['active', 'retired', 'discarded', 'lost', 'destroyed'] as const;

/** A query boolean that accepts only the literal wire values `true` and `false`. */
export const StrictQueryBool = z.enum(['true', 'false']);

/** The most items one `ids` filter may name; a page of labels, not a catalogue export. */
export const WEB_ITEMS_MAX_IDS = 200;

const IdList = z
  .string()
  .regex(/^[^,\s]+(,[^,\s]+)*$/, 'a comma-separated list of item ids')
  .refine((value) => value.split(',').length <= WEB_ITEMS_MAX_IDS, {
    message: `at most ${WEB_ITEMS_MAX_IDS} ids`,
  });

export const WebItemsQuerySchema = z.object({
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
  /** Case-insensitive text filter, trimmed to a non-empty string of at most 200 characters. */
  q: z.string().trim().min(1).max(200).optional(),
  untyped: StrictQueryBool.optional(),
  isContainer: StrictQueryBool.optional(),
  access: z.enum(['open', 'closed']).optional(),
  isFull: StrictQueryBool.optional(),
  lifecycle: z.enum(WEB_LIFECYCLES).optional(),
  legacyLabelOf: z.string().min(1).optional(),
  within: z.string().min(1).optional(),
  effectiveLocationId: z.string().min(1).optional(),
  sort: z.enum(WEB_ITEMS_SORTS).optional(),
});

/** Direct and recursive live content counts for one returned container. */
export const WebItemContentCountSchema = z.object({
  direct: z.number().int().nonnegative(),
  deep: z.number().int().nonnegative(),
});

/** Content counts keyed by the returned container item id. */
export const WebItemContentCountsSchema = z.record(z.string(), WebItemContentCountSchema);

/** The direct and recursive live row counts for one container. */
export type WebItemContentCount = z.infer<typeof WebItemContentCountSchema>;

/** Direct and recursive live row counts keyed by returned container id. */
export type WebItemContentCounts = z.infer<typeof WebItemContentCountsSchema>;

export const WebItemsResponseSchema = z.object({
  items: z.array(SyncItemSchema),
  contentCounts: WebItemContentCountsSchema,
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  unfilteredTotal: z.number().int().nonnegative(),
  hiddenInactiveCount: z.number().int().nonnegative(),
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
    query: WebItemsQuerySchema,
    responses: { 200: WebItemsResponseSchema, 400: ErrorBodySchema },
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
