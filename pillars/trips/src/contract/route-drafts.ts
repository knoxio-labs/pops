import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  RouteDraftOperationResultSchema,
  RouteDraftOperationSchema,
  RouteDraftPreviewInputSchema,
  RouteDraftPreviewSchema,
} from './route-draft-schemas.js';

const c = initContract();
const Id = z.coerce.number().int().positive().safe();
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };

/** Dedicated source-aware draft deletion capability, separate from route placement authority. */
export const routeDraftsContract = c.router({
  preview: {
    method: 'POST',
    path: '/trips/:tripId/route/paths/:pathId/deletion-preview',
    pathParams: z.object({ tripId: Id, pathId: Id }),
    body: RouteDraftPreviewInputSchema,
    metadata: { readOnly: true },
    responses: { 200: RouteDraftPreviewSchema, ...errors },
  },
  operate: {
    method: 'POST',
    path: '/trips/:tripId/route/draft-operations',
    pathParams: z.object({ tripId: Id }),
    body: RouteDraftOperationSchema,
    responses: { 200: RouteDraftOperationResultSchema, ...errors },
  },
});
