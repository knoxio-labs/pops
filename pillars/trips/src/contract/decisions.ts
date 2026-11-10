import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  DecisionSchema,
  DecisionOptionSchema,
  DecisionInputSchema,
  DecisionOptionInputSchema,
} from './decision-schemas.js';

const c = initContract();
const Id = z.coerce.number().int().positive();
const TripParams = z.object({ tripId: Id });
const DecisionParams = TripParams.extend({ id: Id });
const OptionsParams = TripParams.extend({ decisionId: Id });
const OptionParams = OptionsParams.extend({ id: Id });
/** Every successful guarded mutation advances this aggregate revision by exactly one; failures preserve it. */
export const DecisionRevisionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
});
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };
/** Decision source capture and explicit selection; selection never changes affected arrangements. */
export const decisionsContract = c.router({
  workspace: {
    method: 'GET',
    path: '/trips/:tripId/decisions/:id/workspace',
    pathParams: DecisionParams,
    responses: {
      200: z.object({ decision: DecisionSchema, options: z.array(DecisionOptionSchema) }),
      ...errors,
    },
  },
  list: {
    method: 'GET',
    path: '/trips/:tripId/decisions',
    pathParams: TripParams,
    responses: { 200: z.object({ decisions: z.array(DecisionSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/decisions/:id',
    pathParams: DecisionParams,
    responses: { 200: DecisionSchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/decisions',
    pathParams: TripParams,
    body: DecisionInputSchema,
    responses: { 201: DecisionSchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/decisions/:id',
    pathParams: DecisionParams,
    body: DecisionInputSchema.extend(DecisionRevisionSchema.shape),
    responses: { 200: DecisionSchema, ...errors },
  },
  select: {
    method: 'PUT',
    path: '/trips/:tripId/decisions/:id/selection',
    pathParams: DecisionParams,
    body: DecisionRevisionSchema.extend({ optionId: z.number().int().positive().nullable() }),
    responses: { 200: DecisionSchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/decisions/:id',
    pathParams: DecisionParams,
    body: DecisionRevisionSchema,
    responses: { 204: c.noBody(), ...errors },
  },
});
/** Independently editable options guarded by their owning decision revision. */
export const decisionOptionsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/decisions/:decisionId/options',
    pathParams: OptionsParams,
    responses: { 200: z.object({ options: z.array(DecisionOptionSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/decisions/:decisionId/options/:id',
    pathParams: OptionParams,
    responses: { 200: DecisionOptionSchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/decisions/:decisionId/options',
    pathParams: OptionsParams,
    body: DecisionOptionInputSchema.extend(DecisionRevisionSchema.shape),
    responses: { 201: DecisionOptionSchema, ...errors },
  },
  update: {
    method: 'PATCH',
    path: '/trips/:tripId/decisions/:decisionId/options/:id',
    pathParams: OptionParams,
    body: DecisionOptionInputSchema.extend(DecisionRevisionSchema.shape),
    responses: { 200: DecisionOptionSchema, ...errors },
  },
  restore: {
    method: 'POST',
    path: '/trips/:tripId/decisions/:decisionId/options/:id/restore',
    pathParams: OptionParams,
    body: DecisionRevisionSchema.extend({ select: z.boolean() }),
    responses: { 200: DecisionOptionSchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/decisions/:decisionId/options/:id',
    pathParams: OptionParams,
    body: DecisionRevisionSchema,
    responses: { 204: c.noBody(), ...errors },
  },
});
