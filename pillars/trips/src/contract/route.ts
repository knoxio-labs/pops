import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  RouteOperationResultSchema,
  RouteOperationSchema,
  TripRouteReadSchema,
} from './route-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive().safe() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };
/** Flat mixed route and exclusive complete-path moves; dates never determine placement. */
export const routeContract = c.router({
  get: {
    method: 'GET',
    path: '/trips/:tripId/route',
    pathParams: Trip,
    responses: { 200: TripRouteReadSchema, ...errors },
  },
  operate: {
    method: 'POST',
    path: '/trips/:tripId/route/operations',
    pathParams: Trip,
    body: RouteOperationSchema,
    responses: { 200: RouteOperationResultSchema, ...errors },
  },
});
