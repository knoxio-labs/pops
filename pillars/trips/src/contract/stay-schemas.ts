import { z } from 'zod';

import { CalendarDateSchema, SourceLinkSchema } from './schemas.js';
import { SourceClockSchema, SourceTimeZoneSchema } from './source-time.js';

const Id = z.number().int().positive();
const Text = z.string().refine((value) => value.trim().length > 0, 'Expected nonblank source text');

/** Independent stay source facts; departure is checkout-exclusive and no instant is inferred. */
export const StayTimingSchema = z.object({
  arrival: CalendarDateSchema.optional(),
  departure: CalendarDateSchema.optional(),
  checkIn: SourceClockSchema.optional(),
  checkOut: SourceClockSchema.optional(),
  timeZone: SourceTimeZoneSchema.optional(),
});

const Fields = {
  visitId: Id.nullable().optional(),
  name: Text.nullable().optional(),
  kind: z.enum(['hotel', 'friend', 'family', 'other']).nullable().optional(),
  status: z.enum(['Considering', 'Agreed', 'Reserved', 'Purchased']).nullable().optional(),
  timing: StayTimingSchema.optional(),
  address: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
  hostLinks: z.array(SourceLinkSchema).optional(),
  documentLinks: z.array(SourceLinkSchema).optional(),
};

/** A trip-owned stay; visit association, timing and status remain independent source facts. */
export const StaySchema = z.object({
  id: Id,
  tripId: Id,
  visitId: Fields.visitId.unwrap(),
  name: Fields.name.unwrap(),
  kind: Fields.kind.unwrap(),
  status: Fields.status.unwrap(),
  timing: StayTimingSchema,
  address: Fields.address.unwrap(),
  reference: Fields.reference.unwrap(),
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
  hostLinks: z.array(SourceLinkSchema),
  documentLinks: z.array(SourceLinkSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Creation/patch fields; omission preserves, timing/arrays replace, and null clears nullable fields. */
export const StayInputSchema = z.object(Fields);
/** Persisted stay source facts with opaque host/document references. */
export type Stay = z.infer<typeof StaySchema>;
/** Independent calendar dates, optional clocks and an explicit source zone. */
export type StayTiming = z.infer<typeof StayTimingSchema>;
/** Source fields accepted by stay creation and patch operations. */
export type StayInput = z.infer<typeof StayInputSchema>;
