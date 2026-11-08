import { Temporal } from '@js-temporal/polyfill';

import { JourneyEndpointSchema } from '../contract/journey-schemas.js';

import type { JourneyEndpoint } from '../contract/journey-schemas.js';

const ClockSource = JourneyEndpointSchema.pick({ local: true, timeZone: true }).required();
const NANOSECONDS_PER_MINUTE = 60_000_000_000;

/** Resolve explicit source clocks only; missing, skipped, repeated or unsupported clocks remain unresolved.
 * @see https://tc39.es/proposal-temporal/docs/timezone.html
 */
export function journeyClockInstant(endpoint: JourneyEndpoint): Temporal.Instant | null {
  const source = ClockSource.safeParse(endpoint);
  if (!source.success) return null;
  try {
    return Temporal.PlainDateTime.from(source.data.local, { overflow: 'reject' })
      .toZonedDateTime(source.data.timeZone, { disambiguation: 'reject' })
      .toInstant();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Signed actual elapsed minutes, including overlaps; unresolved endpoints produce no estimate. */
export function journeyElapsedMinutes(from: JourneyEndpoint, to: JourneyEndpoint): number | null {
  return elapsedJourneyInstants(journeyClockInstant(from), journeyClockInstant(to));
}

/** Resolve midnight after an integer calendar-day shift in the source zone, never a fixed 24-hour shift. */
export function journeyDayBoundary(
  endpoint: JourneyEndpoint,
  days: number
): Temporal.Instant | null {
  if (journeyClockInstant(endpoint) === null) return null;
  const source = ClockSource.parse(endpoint);
  try {
    return Temporal.PlainDateTime.from(source.local)
      .toPlainDate()
      .add({ days })
      .toPlainDateTime('00:00')
      .toZonedDateTime(source.timeZone, { disambiguation: 'reject' })
      .toInstant();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Signed elapsed minutes between resolved instants, retaining unknowns without an estimate. */
export function elapsedJourneyInstants(
  start: Temporal.Instant | null,
  end: Temporal.Instant | null
): number | null {
  if (start === null || end === null) return null;
  return Number(end.epochNanoseconds - start.epochNanoseconds) / NANOSECONDS_PER_MINUTE;
}
