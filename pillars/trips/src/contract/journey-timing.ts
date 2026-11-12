import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

import { CalendarDateSchema } from './schemas.js';

/** Supplied source precision is independent of whether an instant can be resolved. */
export const JourneyEndpointDaySchema = z.discriminatedUnion('precision', [
  z.object({ date: z.null(), precision: z.literal('unknown') }),
  z.object({ date: CalendarDateSchema, precision: z.literal('day') }),
  z.object({ date: CalendarDateSchema, precision: z.literal('local') }),
]);

const Id = z.number().int().positive();
const Instant = z.string().refine((value) => {
  try {
    Temporal.Instant.from(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}, 'Expected an ISO instant');

/** Nonblocking chronology finding; source records remain authoritative and editable. */
export const JourneyTimingFindingSchema = z.object({
  id: z.string(),
  kind: z.literal('conflict'),
  code: z.enum([
    'clock_unresolved',
    'arrival_before_departure',
    'departure_before_previous_arrival',
  ]),
  legIds: z.array(Id),
  endpoint: z.enum(['from', 'to']).optional(),
});

/** Derived endpoint instants and signed elapsed minutes; null means no unambiguous calculation. */
export const JourneyLegTimingSchema = z.object({
  legId: Id,
  departure: Instant.nullable(),
  arrival: Instant.nullable(),
  elapsedMinutes: z.number().nullable(),
  departureSource: JourneyEndpointDaySchema.optional(),
  arrivalSource: JourneyEndpointDaySchema.optional(),
});

/** Signed time between adjacent source legs; it is not an estimate of transfer time or safety. */
export const JourneyConnectionTimingSchema = z.object({
  previousLegId: Id,
  nextLegId: Id,
  availableMinutes: z.number().nullable(),
});

/** Read-only timing projection; nearby booking, transport and location rules are separate concerns. */
export const JourneyTimingSchema = z.object({
  journeyId: Id,
  legs: z.array(JourneyLegTimingSchema),
  connections: z.array(JourneyConnectionTimingSchema),
  window: z.object({ from: Instant, toExclusive: Instant }).nullable(),
  findings: z.array(JourneyTimingFindingSchema),
});

/** Nonblocking derived chronology contradiction or unresolvable complete clock. */
export type JourneyTimingFinding = z.infer<typeof JourneyTimingFindingSchema>;
/** Source calendar day and precision without an inferred midnight or all-day interval. */
export type JourneyEndpointDay = z.infer<typeof JourneyEndpointDaySchema>;
/** Derived instants and signed source-leg elapsed minutes. */
export type JourneyLegTiming = z.infer<typeof JourneyLegTimingSchema>;
/** Signed adjacent-leg availability without location or mode assumptions. */
export type JourneyConnectionTiming = z.infer<typeof JourneyConnectionTimingSchema>;
/** Read-only source timing projection. */
export type JourneyTiming = z.infer<typeof JourneyTimingSchema>;
