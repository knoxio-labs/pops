/** The phone's persisted Ego conversation list and thread read surface. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileEgoBatchDecisionBodySchema,
  MobileEgoBatchOutcomeSchema,
  MobileEgoConversationPageSchema,
  MobileEgoThreadSchema,
} from './mobile-ego-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
  MobilePageLimit,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();

/** The read-only conversation history the paired phone can reopen. */
export const mobileEgoContract = c.router({
  listConversations: {
    method: 'GET',
    path: '/mobile/ego/conversations',
    query: z.object({
      limit: MobilePageLimit,
      offset: z.coerce.number().int().nonnegative().optional(),
      q: z.string().optional(),
    }),
    responses: {
      200: MobileEgoConversationPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One page of Ego conversations for the mobile client',
    metadata: requires('ego.chat'),
  },
  getConversation: {
    method: 'GET',
    path: '/mobile/ego/conversations/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileEgoThreadSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Read one Ego conversation with its messages and parts',
    metadata: requires('ego.chat'),
  },
  decideActionBatch: {
    method: 'POST',
    path: '/mobile/ego/action-batches/:batchId/decide',
    pathParams: z.object({ batchId: z.string().min(1) }),
    body: MobileEgoBatchDecisionBodySchema,
    responses: {
      200: MobileEgoBatchOutcomeSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      409: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Record a decision for a pending Ego action batch',
    metadata: requires('ego.actions'),
  },
});

/** Type-level view of bfm's mobile Ego conversation contract. */
export type MobileEgoContract = typeof mobileEgoContract;
