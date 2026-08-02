/**
 * Merchant source registration — `source.*` sub-router.
 *
 * `PUT` rather than `POST` because the caller names the slug and the write
 * is idempotent: re-running a deployment's source seed must not fail or
 * duplicate.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, OkSchema, UpsertPurchaseSourceBodySchema } from './rest-schemas.js';
import { PurchaseSourceSchema } from './schemas/purchase.js';

const c = initContract();

export const purchasesSourceContract = c.router({
  list: {
    method: 'GET',
    path: '/sources',
    responses: { 200: z.object({ items: z.array(PurchaseSourceSchema) }) },
    summary: 'List registered purchase sources',
  },
  get: {
    method: 'GET',
    path: '/sources/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: PurchaseSourceSchema, 404: ErrorBodySchema },
    summary: 'Get a single purchase source',
  },
  upsert: {
    method: 'PUT',
    path: '/sources/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpsertPurchaseSourceBodySchema,
    responses: { 200: PurchaseSourceSchema, 400: ErrorBodySchema },
    summary: 'Register or update a purchase source',
  },
  delete: {
    method: 'DELETE',
    path: '/sources/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: OkSchema,
      404: ErrorBodySchema,
      // Purchases still reference this source; deleting it would orphan
      // them, so the foreign key refuses.
      409: ErrorBodySchema,
    },
    summary: 'Delete a purchase source that has no purchases',
  },
});
