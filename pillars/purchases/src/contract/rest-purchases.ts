/**
 * Order CRUD — `purchase.*` sub-router.
 *
 * Read and write only. Nothing here links, matches, or sweeps: the
 * reconciliation surface arrives with the matching engine.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  CreatePurchaseBodySchema,
  ErrorBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
  OkSchema,
  PatchItemBodySchema,
} from './rest-schemas.js';
import {
  IsoTimestampSchema,
  PurchaseDetailSchema,
  PurchaseItemDetailSchema,
  PurchaseItemSchema,
  PurchaseSchema,
} from './schemas/purchase.js';

const c = initContract();

/**
 * A line that carries the requested tag, with the tag's own confirmation
 * marker beside it.
 *
 * The marker travels because the item alone cannot carry it — the tag is on
 * the join row, not the line — and a list of lines "tagged `snack`" that
 * silently mixes proposals with decisions is exactly the counterfactual a
 * consumer must not compute.
 */
const TaggedItemSchema = z.object({
  item: PurchaseItemSchema,
  confirmedAt: IsoTimestampSchema.nullable(),
});

export const purchasesPurchaseContract = c.router({
  list: {
    method: 'GET',
    path: '/purchases',
    query: ListPurchasesQuerySchema,
    responses: {
      200: z.object({ items: z.array(PurchaseSchema) }),
      // Two merchant parameters at once. Declared, because the alternative a
      // caller cannot detect is a 200 computed from whichever one won.
      400: ErrorBodySchema,
    },
    summary: 'List orders, newest first',
  },
  get: {
    method: 'GET',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: PurchaseDetailSchema,
      404: ErrorBodySchema,
    },
    summary: 'Get an order with its deliveries, lines, charges, documents and accounting split',
  },
  create: {
    method: 'POST',
    path: '/purchases',
    body: CreatePurchaseBodySchema,
    responses: {
      201: PurchaseDetailSchema,
      400: ErrorBodySchema,
      // A checksum that already exists. Adapters treat this as a skip, not
      // a failure — re-ingesting the same export bundle is expected.
      409: ErrorBodySchema,
    },
    summary: 'Create an order with its deliveries, lines, charges and documents',
  },
  delete: {
    method: 'DELETE',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Hard-delete an order (everything hanging off it cascades)',
  },
  /**
   * The pillar's first item-level mutation, and the only way an item tag or
   * a confirmed kind is ever written.
   *
   * Scoped under the order rather than a bare `/items/:itemId` so a line
   * cannot be addressed without its order — the id is a random UUID and a
   * caller that has one but not the other is guessing.
   */
  patchItem: {
    method: 'PATCH',
    path: '/purchases/:id/items/:itemId',
    pathParams: z.object({ id: z.string(), itemId: z.string() }),
    body: PatchItemBodySchema,
    responses: {
      200: PurchaseItemDetailSchema,
      400: ErrorBodySchema,
      404: ErrorBodySchema,
    },
    summary: "Confirm a line's kind and item tags",
  },
  itemsByTag: {
    method: 'GET',
    path: '/items',
    query: ListItemsByTagQuerySchema,
    responses: { 200: z.object({ items: z.array(TaggedItemSchema) }) },
    summary: 'Every line carrying an item tag, across every order',
  },
});
