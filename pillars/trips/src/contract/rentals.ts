import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { ArrangementRevisionBody } from './arrangement-revision.js';
import { RentalInputSchema, RentalSchema } from './rental-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const Record = Trip.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };

/** Rental CRUD preserves independent dates, Visit identities and explicit purchase state. */
export const rentalsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/rentals',
    pathParams: Trip,
    responses: { 200: z.object({ rentals: z.array(RentalSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/rentals/:id',
    pathParams: Record,
    responses: { 200: RentalSchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/rentals',
    pathParams: Trip,
    body: RentalInputSchema,
    responses: { 201: RentalSchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/rentals/:id',
    pathParams: Record,
    body: RentalInputSchema.extend(ArrangementRevisionBody.shape),
    responses: { 200: RentalSchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/rentals/:id',
    pathParams: Record,
    body: ArrangementRevisionBody,
    responses: { 204: c.noBody(), ...errors },
  },
});
