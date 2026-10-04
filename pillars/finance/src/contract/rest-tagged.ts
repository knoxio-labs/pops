/** Unmounted shared-tag carrier contract for finance transactions. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  TagAssignmentResponseSchema,
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema,
} from '@pops/types';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const TransactionTagParams = z.object({
  entityType: z.literal('transaction'),
  entityId: z.string().min(1),
  tagId: z.string().min(1),
});

export const financeTaggedContract = c.router({
  list: {
    method: 'POST',
    path: '/tagged/query',
    body: TaggedQueryRequestSchema,
    responses: { 200: TaggedQueryResponseSchema, ...ERR_RESPONSES },
    summary: 'List finance transactions carrying any requested shared tag ids',
  },
  attach: {
    method: 'PUT',
    path: '/tagged/:entityType/:entityId/tags/:tagId',
    pathParams: TransactionTagParams,
    body: c.noBody(),
    responses: { 200: TagAssignmentResponseSchema, ...ERR_RESPONSES },
    summary: 'Attach a shared tag to a finance transaction',
  },
  detach: {
    method: 'DELETE',
    path: '/tagged/:entityType/:entityId/tags/:tagId',
    pathParams: TransactionTagParams,
    body: c.noBody(),
    responses: { 200: TagAssignmentResponseSchema, ...ERR_RESPONSES },
    summary: 'Detach a shared tag from a finance transaction',
  },
});
