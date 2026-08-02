/**
 * Purchase document CRUD — `purchase.*` sub-router.
 *
 * Read and write only. Nothing here links, matches, or sweeps: the
 * reconciliation surface arrives with the engine (POPS-237).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  CreatePurchaseBodySchema,
  ErrorBodySchema,
  ListPurchasesQuerySchema,
  OkSchema,
} from './rest-schemas.js';
import { PurchaseDetailSchema, PurchaseSchema } from './schemas/purchase.js';

const c = initContract();

export const purchasesPurchaseContract = c.router({
  list: {
    method: 'GET',
    path: '/purchases',
    query: ListPurchasesQuerySchema,
    responses: {
      200: z.object({ items: z.array(PurchaseSchema) }),
    },
    summary: 'List purchase documents, newest first',
  },
  get: {
    method: 'GET',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: PurchaseDetailSchema,
      404: ErrorBodySchema,
    },
    summary: 'Get a purchase with its line items, links and residual',
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
    summary: 'Create a purchase document and its line items',
  },
  delete: {
    method: 'DELETE',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Hard-delete a purchase (cascades items and links)',
  },
});
