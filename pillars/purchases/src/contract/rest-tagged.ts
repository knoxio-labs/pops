/** Shared-tag carrier contract for purchases line items. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  TagAssignmentResponseSchema,
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema,
} from '@pops/types';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

const PurchaseItemTagParams = z.object({
  entityType: z.literal('purchase-item'),
  entityId: z.string().min(1),
  tagId: z.string().min(1),
});

export const purchasesTaggedContract = c.router({
  list: {
    method: 'POST',
    path: '/tagged/query',
    body: TaggedQueryRequestSchema,
    responses: { 200: TaggedQueryResponseSchema, 400: ErrorBodySchema },
    summary: 'List purchase line items carrying any requested shared tag ids',
  },
  attach: {
    method: 'PUT',
    path: '/tagged/:entityType/:entityId/tags/:tagId',
    body: c.noBody(),
    pathParams: PurchaseItemTagParams,
    responses: { 200: TagAssignmentResponseSchema, 400: ErrorBodySchema, 404: ErrorBodySchema },
    summary: 'Attach a shared tag to a purchase line item',
  },
  detach: {
    method: 'DELETE',
    path: '/tagged/:entityType/:entityId/tags/:tagId',
    body: c.noBody(),
    pathParams: PurchaseItemTagParams,
    responses: { 200: TagAssignmentResponseSchema, 400: ErrorBodySchema, 404: ErrorBodySchema },
    summary: 'Detach a shared tag from a purchase line item',
  },
});
