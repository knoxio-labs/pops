import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  JourneyInputSchema,
  JourneyLegInputSchema,
  JourneyLegSchema,
  JourneySchema,
  ReorderJourneyLegsBody,
} from './journey-schemas.js';
import { JourneyTimingSchema } from './journey-timing.js';
import { JourneyWorkspaceSchema } from './journey-workspace.js';
import {
  JourneyLegSetSchema,
  LegRemovalInputSchema,
  LegRemovalResultSchema,
  LegRevisionSchema,
  LegWritePreconditionSchema,
} from './leg-removal-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const Journey = Trip.extend({ id: z.coerce.number().int().positive() });
const Legs = Trip.extend({ journeyId: z.coerce.number().int().positive() });
const Leg = Legs.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema };

/** Trip-owned journey source operations; nothing infers visit placement or changes bookings. */
export const journeysContract = c.router({
  workspace: {
    method: 'GET',
    path: '/trips/:tripId/journeys/:id/workspace',
    pathParams: Journey,
    responses: { 200: JourneyWorkspaceSchema, ...errors },
  },
  timing: {
    method: 'GET',
    path: '/trips/:tripId/journeys/:id/timing',
    pathParams: Journey,
    responses: { 200: JourneyTimingSchema, ...errors },
  },
  list: {
    method: 'GET',
    path: '/trips/:tripId/journeys',
    pathParams: Trip,
    responses: { 200: z.object({ journeys: z.array(JourneySchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/journeys/:id',
    pathParams: Journey,
    responses: { 200: JourneySchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/journeys',
    pathParams: Trip,
    body: JourneyInputSchema,
    responses: { 201: JourneySchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/journeys/:id',
    pathParams: Journey,
    body: JourneyInputSchema,
    responses: { 200: JourneySchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/journeys/:id',
    pathParams: Journey,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors, 409: ErrorBodySchema },
  },
});

/** Independently captured legs; explicit ordering never rewrites endpoint or purchase source facts. */
export const journeyLegsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/journeys/:journeyId/legs',
    pathParams: Legs,
    responses: { 200: JourneyLegSetSchema, ...errors, 409: ErrorBodySchema },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/journeys/:journeyId/legs/:id',
    pathParams: Leg,
    responses: { 200: JourneyLegSchema, ...errors, 409: ErrorBodySchema },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/journeys/:journeyId/legs',
    pathParams: Legs,
    body: JourneyLegInputSchema.extend(LegWritePreconditionSchema.shape),
    responses: { 201: JourneyLegSchema, ...errors, 409: ErrorBodySchema },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/journeys/:journeyId/legs/:id',
    pathParams: Leg,
    body: JourneyLegInputSchema.extend(LegWritePreconditionSchema.shape),
    responses: { 200: JourneyLegSchema, ...errors, 409: ErrorBodySchema },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/journeys/:journeyId/legs/:id',
    pathParams: Leg,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors, 409: ErrorBodySchema },
  },
  remove: {
    method: 'POST',
    path: '/trips/:tripId/journeys/:journeyId/legs/:id/removals',
    pathParams: Leg,
    body: LegRemovalInputSchema,
    responses: { 200: LegRemovalResultSchema, ...errors, 409: ErrorBodySchema },
  },
  restore: {
    method: 'POST',
    path: '/trips/:tripId/journeys/:journeyId/leg-removals/:operationId/restore',
    pathParams: Legs.extend({ operationId: z.uuid() }),
    body: z.object({ expectedRevision: LegRevisionSchema }),
    responses: { 200: LegRemovalResultSchema, ...errors, 409: ErrorBodySchema },
  },
  reorder: {
    method: 'PUT',
    path: '/trips/:tripId/journeys/:journeyId/leg-order',
    pathParams: Legs,
    body: ReorderJourneyLegsBody.extend(LegWritePreconditionSchema.shape),
    responses: {
      200: z.object({ legs: z.array(JourneyLegSchema) }),
      ...errors,
      409: ErrorBodySchema,
    },
  },
});
