import { Temporal } from '@js-temporal/polyfill';

import {
  elapsedJourneyInstants,
  journeyClockInstant,
  journeyDayBoundary,
  journeySourceDay,
} from './journey-time.js';

import type { JourneyLeg } from '../contract/journey-schemas.js';
import type {
  JourneyConnectionTiming,
  JourneyLegTiming,
  JourneyTiming,
  JourneyTimingFinding,
} from '../contract/journey-timing.js';

interface ResolvedLeg {
  source: JourneyLeg;
  from: Temporal.Instant | null;
  to: Temporal.Instant | null;
  timing: JourneyLegTiming;
  findings: JourneyTimingFinding[];
}

function resolveLeg(source: JourneyLeg): ResolvedLeg {
  const from = journeyClockInstant(source.from);
  const to = journeyClockInstant(source.to);
  const elapsedMinutes = elapsedJourneyInstants(from, to);
  const findings: JourneyTimingFinding[] = [];
  for (const [endpoint, instant] of [
    ['from', from],
    ['to', to],
  ] as const) {
    if (
      source[endpoint].local !== undefined &&
      source[endpoint].timeZone !== undefined &&
      instant === null
    )
      findings.push({
        id: `leg:${source.id}:${endpoint}:clock`,
        kind: 'conflict',
        code: 'clock_unresolved',
        legIds: [source.id],
        endpoint,
      });
  }
  if (elapsedMinutes !== null && elapsedMinutes < 0)
    findings.push({
      id: `leg:${source.id}:chronology`,
      kind: 'conflict',
      code: 'arrival_before_departure',
      legIds: [source.id],
    });
  return {
    source,
    from,
    to,
    timing: {
      legId: source.id,
      departure: from?.toString() ?? null,
      arrival: to?.toString() ?? null,
      elapsedMinutes,
      departureSource: journeySourceDay(source.from),
      arrivalSource: journeySourceDay(source.to),
    },
    findings,
  };
}

function connection(
  previous: ResolvedLeg,
  next: ResolvedLeg
): { timing: JourneyConnectionTiming; findings: JourneyTimingFinding[] } {
  const availableMinutes = elapsedJourneyInstants(previous.to, next.from);
  const legIds = [previous.source.id, next.source.id];
  return {
    timing: { previousLegId: previous.source.id, nextLegId: next.source.id, availableMinutes },
    findings:
      availableMinutes !== null && availableMinutes < 0
        ? [
            {
              id: `connection:${previous.source.id}:${next.source.id}:chronology`,
              kind: 'conflict',
              code: 'departure_before_previous_arrival',
              legIds,
            },
          ]
        : [],
  };
}

function timingWindow(legs: readonly JourneyLeg[]): JourneyTiming['window'] {
  const first = legs.at(0);
  const last = legs.at(-1);
  if (!first || !last) return null;
  const from = journeyDayBoundary(first.from, -1);
  const to = journeyDayBoundary(last.to, 2);
  if (from === null || to === null || Temporal.Instant.compare(to, from) <= 0) return null;
  return { from: from.toString(), toExclusive: to.toString() };
}

/** Derive source chronology only; unknowns, modes, source identities and purchase facts are never inferred. */
export function deriveJourneyTiming(journeyId: number, legs: readonly JourneyLeg[]): JourneyTiming {
  const resolved = legs.map(resolveLeg);
  const connections = resolved.flatMap((next, index) => {
    const previous = resolved[index - 1];
    return previous ? [connection(previous, next)] : [];
  });
  return {
    journeyId,
    legs: resolved.map((leg) => leg.timing),
    connections: connections.map((item) => item.timing),
    window: timingWindow(legs),
    findings: [
      ...resolved.flatMap((leg) => leg.findings),
      ...connections.flatMap((item) => item.findings),
    ],
  };
}
