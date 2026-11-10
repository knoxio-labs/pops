import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { ArrangementRevisionBody, ArrangementRevisionSchema } from './arrangement-revision.js';
import { ContactUriSchema } from './contact-reference.js';

/** Whole arrangements supported by explicit responsibility; legs are never targets. */
export const RESPONSIBILITY_TARGET_KINDS = ['journey', 'stay', 'event', 'rental'] as const;
/** Runtime ownership target vocabulary. */
export const ResponsibilityTargetKindSchema = z.enum(RESPONSIBILITY_TARGET_KINDS);
/** Contact URI shape; new selections require owner proof, retained values remain usable offline. */
export const ContactResponsibilityUriSchema = ContactUriSchema;
/** Explicit self or Contacts responsibility; absence is represented by null. */
export const ResponsibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('self') }),
  z.object({ kind: z.literal('contact'), uri: ContactResponsibilityUriSchema }),
]);
/** A target's current association, including retained revisions after clearing. */
export const ArrangementResponsibilitySchema = z.object({
  tripId: z.number().int().positive(),
  targetKind: ResponsibilityTargetKindSchema,
  targetId: z.number().int().positive(),
  responsibility: ResponsibilitySchema.nullable(),
  revision: ArrangementRevisionSchema,
});
/** Supported whole-arrangement ownership target. */
export type ResponsibilityTargetKind = z.infer<typeof ResponsibilityTargetKindSchema>;
/** Optional explicit self or Contacts-issued identity; never a permission grant. */
export type Responsibility = z.infer<typeof ResponsibilitySchema> | null;
/** Revisioned assignment state; an untouched target has revision zero and null responsibility. */
export type ArrangementResponsibility = z.infer<typeof ArrangementResponsibilitySchema>;

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const Target = Trip.extend({
  targetKind: ResponsibilityTargetKindSchema,
  targetId: z.coerce.number().int().positive(),
});
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };
/** Read or explicitly replace/clear responsibility without mutating the arrangement or Contacts. */
export const responsibilitiesContract = c.router({
  list: {
    method: 'GET',
    path: '/trips/:tripId/responsibilities',
    pathParams: Trip,
    responses: {
      200: z.object({ responsibilities: z.array(ArrangementResponsibilitySchema) }),
      ...errors,
    },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/responsibilities/:targetKind/:targetId',
    pathParams: Target,
    responses: { 200: ArrangementResponsibilitySchema, ...errors },
  },
  replace: {
    method: 'PUT',
    path: '/trips/:tripId/responsibilities/:targetKind/:targetId',
    pathParams: Target,
    body: ArrangementRevisionBody.extend({ responsibility: ResponsibilitySchema.nullable() }),
    responses: { 200: ArrangementResponsibilitySchema, 503: ErrorBodySchema, ...errors },
  },
});
