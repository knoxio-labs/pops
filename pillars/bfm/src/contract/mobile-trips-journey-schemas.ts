import { z } from 'zod';

import {
  MobileTripAuditFields,
  MobileTripDateSchema,
  MobileTripIdSchema,
  MobileTripSourceLinkSchema,
  MobileTripTimeZoneSchema,
} from './mobile-trips-schemas.js';

/** Optional local wall clock and zone are separate source facts, never an invented UTC instant. */
export const MobileJourneyEndpointSchema = z.object({
  placeId: MobileTripIdSchema.optional(),
  sourceLabel: z.string().optional(),
  sourceLinks: z.array(MobileTripSourceLinkSchema).optional(),
  local: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/u)
    .refine((value) => MobileTripDateSchema.safeParse(value.slice(0, 10)).success)
    .refine((value) => z.iso.time().safeParse(value.slice(11)).success)
    .optional(),
  timeZone: MobileTripTimeZoneSchema.optional(),
});
/** Configured producer thresholds remain optional; BFM does not invent safety minimums. */
export const MobileJourneyBuffersSchema = z.object({
  minimumConnectionMinutes: z.number().nonnegative().optional(),
  airportBufferMinutes: z.number().nonnegative().optional(),
});
/** Independent journey source metadata; its leg order is carried separately. */
export const MobileJourneySchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  name: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  reference: z.string().nullable(),
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  buffers: MobileJourneyBuffersSchema,
  ...MobileTripAuditFields,
});
/** Original leg facts preserve intention, arrangement and purchase as independent fields. */
export const MobileJourneyLegSchema = z.object({
  id: MobileTripIdSchema,
  journeyId: MobileTripIdSchema,
  mode: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  from: MobileJourneyEndpointSchema,
  to: MobileJourneyEndpointSchema,
  intention: z.enum(['In plan', 'Considering', 'Alternative']).nullable(),
  arrangement: z.enum(['Booked', 'Agreed', 'Not arranged', 'Not needed']).nullable(),
  purchase: z.literal('Purchased').nullable(),
  operator: z.string().nullable(),
  service: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** Explicit selected and alternative journey IDs; no selection is inferred from status or time. */
export const MobileJourneyGroupSchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  currentJourneyId: MobileTripIdSchema,
  alternativeJourneyIds: z.array(MobileTripIdSchema),
  revision: z.number().int().nonnegative(),
  ...MobileTripAuditFields,
});
/** Original journey source record. */
export type MobileJourney = z.infer<typeof MobileJourneySchema>;
/** Original ordered leg source record. */
export type MobileJourneyLeg = z.infer<typeof MobileJourneyLegSchema>;
/** Explicit producer journey selection group. */
export type MobileJourneyGroup = z.infer<typeof MobileJourneyGroupSchema>;
