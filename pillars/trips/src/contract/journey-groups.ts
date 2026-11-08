import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { JourneySchema } from './journey-schemas.js';

const Id = z.number().int().positive();
const Revision = z.number().int().nonnegative();
const TripParams = z.object({ tripId: z.coerce.number().int().positive() });
const GroupParams = TripParams.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };
const c = initContract();

/** Grouping metadata only; source journeys and their leg identities remain independently editable. */
export const JourneyGroupSchema = z.object({
  id: Id,
  tripId: Id,
  currentJourneyId: Id,
  alternativeJourneyIds: z.array(Id),
  revision: Revision,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Explicit source membership; repeated identities cannot represent distinct alternatives. */
export const CreateJourneyGroupBody = z
  .object({
    currentJourneyId: Id,
    alternativeJourneyIds: z.array(Id).optional(),
  })
  .refine((value) => {
    const members = [value.currentJourneyId, ...(value.alternativeJourneyIds ?? [])];
    return new Set(members).size === members.length;
  }, 'Each journey must appear once in a group');

/** Optimistic precondition for a grouping mutation, independent of source-record edits. */
export const JourneyGroupRevisionBody = z.object({ expectedRevision: Revision });
/** Explicit member selection; selecting never copies or replaces source records. */
export const SelectJourneyBody = JourneyGroupRevisionBody.extend({ journeyId: Id });

/** Persisted journey grouping state, including ordered alternative identities. */
export type JourneyGroup = z.infer<typeof JourneyGroupSchema>;
/** Explicit source identities adopted by a newly created group. */
export type CreateJourneyGroupInput = z.infer<typeof CreateJourneyGroupBody>;
/** Explicit selected identity and grouping revision precondition. */
export type SelectJourneyInput = z.infer<typeof SelectJourneyBody>;

/** Explicit journey grouping, preview and source-preserving selection operations. */
export const journeyGroupsContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/journey-groups',
    pathParams: TripParams,
    responses: { 200: z.object({ groups: z.array(JourneyGroupSchema) }), ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/journey-groups/:id',
    pathParams: GroupParams,
    responses: { 200: JourneyGroupSchema, ...errors },
  },
  create: {
    method: 'POST',
    path: '/trips/:tripId/journey-groups',
    pathParams: TripParams,
    body: CreateJourneyGroupBody,
    responses: { 201: JourneyGroupSchema, ...errors },
  },
  addBlank: {
    method: 'POST',
    path: '/trips/:tripId/journey-groups/:id/alternatives',
    pathParams: GroupParams,
    body: JourneyGroupRevisionBody,
    responses: { 201: z.object({ group: JourneyGroupSchema, journey: JourneySchema }), ...errors },
  },
  select: {
    method: 'PUT',
    path: '/trips/:tripId/journey-groups/:id/selection',
    pathParams: GroupParams,
    body: SelectJourneyBody,
    responses: { 200: JourneyGroupSchema, ...errors },
  },
  delete: {
    method: 'DELETE',
    path: '/trips/:tripId/journey-groups/:id',
    pathParams: GroupParams,
    body: JourneyGroupRevisionBody,
    responses: { 204: c.noBody(), ...errors },
  },
});
