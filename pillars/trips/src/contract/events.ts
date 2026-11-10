import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { EventInputSchema, EventSchema } from './event-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const Event = Trip.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema };

/** Trip-owned event source operations; no operation changes an external booking or reference. */
export const eventsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/events',
    pathParams: Trip,
    responses: { 200: z.object({ events: z.array(EventSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/events/:id',
    pathParams: Event,
    responses: { 200: EventSchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/events',
    pathParams: Trip,
    body: EventInputSchema,
    responses: { 201: EventSchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/events/:id',
    pathParams: Event,
    body: EventInputSchema,
    responses: { 200: EventSchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/events/:id',
    pathParams: Event,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors, 409: ErrorBodySchema },
  },
});
