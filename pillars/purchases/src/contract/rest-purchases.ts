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
} from './rest-schemas.js';
import { PurchaseDetailSchema, PurchaseItemSchema, PurchaseSchema } from './schemas/purchase.js';

const c = initContract();

export const purchasesPurchaseContract = c.router({
  list: {
    method: 'GET',
    path: '/purchases',
    query: ListPurchasesQuerySchema,
    responses: {
      200: z.object({ items: z.array(PurchaseSchema) }),
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
  itemsByTag: {
    method: 'GET',
    path: '/items',
    query: ListItemsByTagQuerySchema,
    responses: { 200: z.object({ items: z.array(PurchaseItemSchema) }) },
    summary: 'Every line carrying a tag, across every order',
  },
});
