import { ApiError } from '@pops/pillar-sdk/client';

import type { CalendarJourney } from './types';

/** Reject foreign or incomplete aggregate responses instead of manufacturing unknown timing for missing members. */
export function requireJourneySnapshot(
  snapshot: CalendarJourney,
  tripId: number,
  id: number
): CalendarJourney {
  const { journey, legs, timing } = snapshot;
  const ids = new Set(legs.map((leg) => leg.id));
  const validOwner = journey.id === id && journey.tripId === tripId && timing.journeyId === id;
  const validLegs = ids.size === legs.length && legs.every((leg) => leg.journeyId === id);
  const validTiming =
    timing.legs.length === legs.length &&
    timing.legs.every((leg, index) => leg.legId === legs[index]?.id);
  const validFindings = timing.findings.every((finding) =>
    finding.legIds.every((legId) => ids.has(legId))
  );
  if (!validOwner || !validLegs || !validTiming || !validConnections(snapshot) || !validFindings)
    throw new ApiError({
      code: 'trips.calendar.snapshot_invalid',
      kind: 'server',
      message: 'Journey source and timing do not match. Reload the calendar.',
      retryable: true,
    });
  return snapshot;
}
function validConnections({ legs, timing }: CalendarJourney): boolean {
  return (
    timing.connections.length === Math.max(0, legs.length - 1) &&
    timing.connections.every(
      (item, index) =>
        item.previousLegId === legs[index]?.id && item.nextLegId === legs[index + 1]?.id
    )
  );
}
