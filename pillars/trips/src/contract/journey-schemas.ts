import { z } from 'zod';

import { CalendarDateSchema, SourceLinkSchema } from './schemas.js';
import { SourceTimeZoneSchema } from './source-time.js';

const Id = z.number().int().positive();
const Text = z.string().refine((value) => value.trim().length > 0, 'Expected nonblank source text');
const LocalClock = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/u)
  .refine(
    (value) => CalendarDateSchema.safeParse(value.slice(0, 10)).success,
    'Invalid calendar date'
  )
  .refine((value) => z.iso.time().safeParse(value.slice(11)).success, 'Invalid local clock');

const EndpointFields = {
  placeId: Id.optional(),
  sourceLabel: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
  local: LocalClock.optional(),
  timeZone: SourceTimeZoneSchema.optional(),
};

/** One explicit source precision; a calendar day never implies a clock, zone or instant. */
export const JourneyEndpointSchema = z
  .object({ ...EndpointFields, date: CalendarDateSchema.optional() })
  .refine((value) => value.date === undefined || value.local === undefined, {
    message: 'Supply a calendar day or a local datetime, not both',
    path: ['date'],
  });

/** Omitted day preserves a previous day-only value on replacement; null clears it, while local explicitly selects datetime precision. */
export const JourneyEndpointInputSchema = z
  .object({ ...EndpointFields, date: CalendarDateSchema.nullable().optional() })
  .refine((value) => value.date === undefined || value.date === null || value.local === undefined, {
    message: 'Supply a calendar day or a local datetime, not both',
    path: ['date'],
  });

/** Explicit user thresholds in physical minutes; missing thresholds have no default. */
export const JourneyBuffersSchema = z.object({
  minimumConnectionMinutes: z.number().nonnegative().optional(),
  airportBufferMinutes: z.number().nonnegative().optional(),
});

const JourneyFields = {
  name: Text.nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
  buffers: JourneyBuffersSchema.optional(),
};
const LegFields = {
  mode: Text.nullable().optional(),
  from: JourneyEndpointSchema.optional(),
  to: JourneyEndpointSchema.optional(),
  intention: z.enum(['In plan', 'Considering', 'Alternative']).nullable().optional(),
  arrangement: z.enum(['Booked', 'Agreed', 'Not arranged', 'Not needed']).nullable().optional(),
  purchase: z.literal('Purchased').nullable().optional(),
  operator: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
};
const Audit = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };

/** Source metadata of one trip-owned journey, independent of route visits. */
export const JourneySchema = z.object({
  id: Id,
  tripId: Id,
  ...JourneyFields,
  name: Text.nullable(),
  reference: z.string().nullable(),
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
  buffers: JourneyBuffersSchema,
  ...Audit,
});

/** A stable ordered source leg; purchase never changes its intention or arrangement. */
export const JourneyLegSchema = z.object({
  id: Id,
  journeyId: Id,
  ...LegFields,
  mode: Text.nullable(),
  from: JourneyEndpointSchema,
  to: JourneyEndpointSchema,
  intention: LegFields.intention.unwrap(),
  arrangement: LegFields.arrangement.unwrap(),
  purchase: LegFields.purchase.unwrap(),
  operator: z.string().nullable(),
  service: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
  ...Audit,
});

/** Journey creation and patch input; omission retains fields, null clears nullable text. */
export const JourneyInputSchema = z.object(JourneyFields);
/** Supplied endpoints replace old fields; omitted date preserves a day-only value, null clears it and local selects datetime precision. */
export const JourneyLegInputSchema = z.object({
  ...LegFields,
  from: JourneyEndpointInputSchema.optional(),
  to: JourneyEndpointInputSchema.optional(),
});
/** Complete ordered membership, containing every existing leg exactly once. */
export const ReorderJourneyLegsBody = z.object({ legIds: z.array(Id) });
/** A persisted journey source record. */
export type Journey = z.infer<typeof JourneySchema>;
/** A persisted ordered leg source record. */
export type JourneyLeg = z.infer<typeof JourneyLegSchema>;
/** Explicit source endpoint facts, without a derived instant. */
export type JourneyEndpoint = z.infer<typeof JourneyEndpointSchema>;
/** Endpoint write with an explicit day-only clear distinct from legacy omission. */
export type JourneyEndpointInput = z.infer<typeof JourneyEndpointInputSchema>;
/** Configured source thresholds, without implicit defaults. */
export type JourneyBuffers = z.infer<typeof JourneyBuffersSchema>;
/** Fields accepted by journey creation and patch operations. */
export type JourneyInput = z.infer<typeof JourneyInputSchema>;
/** Fields accepted by leg creation and patch operations. */
export type JourneyLegInput = z.infer<typeof JourneyLegInputSchema>;
