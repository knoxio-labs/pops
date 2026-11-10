import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { StayInputSchema, StaySchema } from './stay-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const Stay = Trip.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema };

/** Trip-owned stay source operations; no operation changes an external booking or reference. */
export const staysContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/stays',
    pathParams: Trip,
    responses: { 200: z.object({ stays: z.array(StaySchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/stays/:id',
    pathParams: Stay,
    responses: { 200: StaySchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/stays',
    pathParams: Trip,
    body: StayInputSchema,
    responses: { 201: StaySchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/stays/:id',
    pathParams: Stay,
    body: StayInputSchema,
    responses: { 200: StaySchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/stays/:id',
    pathParams: Stay,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors, 409: ErrorBodySchema },
  },
});
