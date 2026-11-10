import { z } from 'zod';

import { JourneyLegSchema } from './journey-schemas.js';
import { CalendarDateSchema, SourceLinkSchema } from './schemas.js';
import { SourceClockSchema, SourceTimeZoneSchema } from './source-time.js';

const Id = z.number().int().positive();
const Name = z.string().refine((value) => value.trim().length > 0, 'Expected nonblank source text');
const WebUrl = z.url({ protocol: /^https?$/u });

/** Independent event dates, local clocks and source zone; no midnight or instant is inferred. */
export const EventTimingSchema = z.object({
  start: CalendarDateSchema.optional(),
  end: CalendarDateSchema.optional(),
  startTime: SourceClockSchema.optional(),
  endTime: SourceClockSchema.optional(),
  timeZone: SourceTimeZoneSchema.optional(),
});

const Fields = {
  visitId: Id.nullable().optional(),
  name: Name.nullable().optional(),
  intention: JourneyLegSchema.shape.intention.optional(),
  arrangement: JourneyLegSchema.shape.arrangement.optional(),
  purchase: JourneyLegSchema.shape.purchase.optional(),
  timing: EventTimingSchema.optional(),
  address: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  sourceUrl: WebUrl.nullable().optional(),
  ticketUrl: WebUrl.nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
  venueLinks: z.array(SourceLinkSchema).optional(),
  organiserLinks: z.array(SourceLinkSchema).optional(),
  documentLinks: z.array(SourceLinkSchema).optional(),
};

/** Trip-owned event source facts; a wanted date never implies an arrangement or purchase. */
export const EventSchema = z.object({
  id: Id,
  tripId: Id,
  visitId: Fields.visitId.unwrap(),
  name: Fields.name.unwrap(),
  intention: Fields.intention.unwrap(),
  arrangement: Fields.arrangement.unwrap(),
  purchase: Fields.purchase.unwrap(),
  timing: EventTimingSchema,
  address: Fields.address.unwrap(),
  reference: Fields.reference.unwrap(),
  sourceUrl: Fields.sourceUrl.unwrap(),
  ticketUrl: Fields.ticketUrl.unwrap(),
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
  venueLinks: z.array(SourceLinkSchema),
  organiserLinks: z.array(SourceLinkSchema),
  documentLinks: z.array(SourceLinkSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Creation/patch fields; omission retains, null clears nullable facts, objects and arrays replace. */
export const EventInputSchema = z.object(Fields);
/** Persisted event with independent planning, booking and purchase source facts. */
export type TripEvent = z.infer<typeof EventSchema>;
/** Source event timing without fabricated clocks or bounds. */
export type EventTiming = z.infer<typeof EventTimingSchema>;
/** Accepted source capture and patch fields. */
export type EventInput = z.infer<typeof EventInputSchema>;
