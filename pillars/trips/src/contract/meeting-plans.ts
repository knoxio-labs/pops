import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  MeetingPlanOperationResultSchema,
  MeetingPlanOperationSchema,
  MeetingPlanSchema,
} from './meeting-plan-schemas.js';

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive().safe() });
const errors = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
  503: ErrorBodySchema,
};
/** Independent Trips-owned meeting source and receipt-backed mutations, scoped to the owning trip. */
export const meetingPlansContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/meeting-plans',
    pathParams: Trip,
    responses: { 200: z.object({ meetingPlans: z.array(MeetingPlanSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/meeting-plans/:id',
    pathParams: Trip.extend({ id: z.coerce.number().int().positive().safe() }),
    responses: { 200: MeetingPlanSchema, ...errors },
  },
  operate: {
    method: 'POST',
    path: '/trips/:tripId/meeting-plans/operations',
    pathParams: Trip,
    body: MeetingPlanOperationSchema,
    responses: { 200: MeetingPlanOperationResultSchema, ...errors },
  },
});
