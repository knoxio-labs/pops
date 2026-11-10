import { z } from 'zod';

import { ContactUriSchema } from './contact-reference.js';
import { CalendarDateSchema, SourceLinkSchema } from './schemas.js';

const Id = z.number().int().positive();
const Text = z.string().refine((value) => value.trim().length > 0, 'Expected nonblank source text');

/** Approved idea kinds, independent of route membership. */
export const IdeaKindSchema = z.enum(['destination', 'place', 'activity']);
/** Explicit reasons for retaining an idea; none is inferred from its kind or title. */
export const IdeaPurposeSchema = z.enum(['visit', 'meet-people', 'see-someone', 'other']);
/** Local source planning status; In plan does not insert a visit. */
export const IdeaStatusSchema = z.enum(['Saved', 'Considering', 'In plan']);
/** Source timing precision; absent bounds stay unknown and contradictory dates remain editable. */
export const IdeaTimingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({
    mode: z.literal('month'),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
      .optional(),
  }),
  z.object({
    mode: z.literal('dates'),
    from: CalendarDateSchema.optional(),
    to: CalendarDateSchema.optional(),
  }),
]);
/** Retained Contacts reference; URI shape alone is not issuance proof, and unavailable identities remain identifiable. */
export const IdeaContactLinkSchema = SourceLinkSchema.extend({
  uri: ContactUriSchema,
});
/** A Contacts-owned recommender reference; source notes survive an unavailable owner. */
export const IdeaRecommendationSchema = z.object({
  contact: IdeaContactLinkSchema,
  note: z.string(),
});

const Fields = {
  name: Text.nullable(),
  kind: IdeaKindSchema.nullable(),
  purpose: IdeaPurposeSchema.nullable(),
  status: IdeaStatusSchema.nullable(),
  reason: z.string(),
  notes: z.string(),
  address: z.string().nullable(),
  placeId: Id.nullable(),
  visitId: Id.nullable(),
  timing: IdeaTimingSchema,
  sourceLinks: z.array(SourceLinkSchema),
  contactLinks: z.array(IdeaContactLinkSchema),
  recommendations: z.array(IdeaRecommendationSchema),
};

/** Independently identified trip idea with explicit location and source references. */
export const IdeaSchema = z.object({
  id: Id,
  tripId: Id,
  ...Fields,
  revision: z.number().int().positive(),
  removedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Omitted fields retain values on edit; objects and arrays replace, null clears nullable fields. */
export const IdeaInputSchema = z.object(Fields).partial();
/** Persisted source idea. */
export type TripIdea = z.infer<typeof IdeaSchema>;
/** Accepted explicit idea source fields. */
export type IdeaInput = z.infer<typeof IdeaInputSchema>;
/** Typed idea precision without manufactured dates. */
export type IdeaTiming = z.infer<typeof IdeaTimingSchema>;
