import { z } from 'zod';

import { MobileJourneyLegSchema } from './mobile-trips-journey-schemas.js';
import {
  MobileTripAuditFields,
  MobileTripClockSchema,
  MobileTripDateSchema,
  MobileTripIdSchema,
  MobileTripSourceLinkSchema,
  MobileTripTimeZoneSchema,
} from './mobile-trips-schemas.js';

/** Independent source dates and local clocks; absent precision never becomes midnight or UTC. */
export const MobileEventTimingSchema = z.object({
  start: MobileTripDateSchema.optional(),
  end: MobileTripDateSchema.optional(),
  startTime: MobileTripClockSchema.optional(),
  endTime: MobileTripClockSchema.optional(),
  timeZone: MobileTripTimeZoneSchema.optional(),
});
/** Original trip-owned event facts; opaque venue, organiser and document links stay opaque. */
export const MobileTripEventSchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  visitId: MobileTripIdSchema.nullable(),
  name: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  intention: MobileJourneyLegSchema.shape.intention,
  arrangement: MobileJourneyLegSchema.shape.arrangement,
  purchase: MobileJourneyLegSchema.shape.purchase,
  timing: MobileEventTimingSchema,
  address: z.string().nullable(),
  reference: z.string().nullable(),
  sourceUrl: z.url({ protocol: /^https?$/u }).nullable(),
  ticketUrl: z.url({ protocol: /^https?$/u }).nullable(),
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  venueLinks: z.array(MobileTripSourceLinkSchema),
  organiserLinks: z.array(MobileTripSourceLinkSchema),
  documentLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** Event source record with independent intention, arrangement and purchase facts. */
export type MobileTripEvent = z.infer<typeof MobileTripEventSchema>;
