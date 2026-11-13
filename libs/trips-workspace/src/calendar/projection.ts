import { activeJourneys } from './membership';
import { sourceEndpoints } from './source-endpoints';

import type { CalendarEntry, CalendarSnapshot } from './types';

/** Project independent source endpoints without inferred dates, modes, zones or visit associations. */
export function calendarEntries(snapshot: CalendarSnapshot): CalendarEntry[] {
  return [
    ...activeJourneys(snapshot).flatMap(journeyEntries),
    ...snapshot.stays.flatMap((stay) =>
      sourceEndpoints(
        {
          source: { kind: 'stay', id: stay.id },
          title: stay.name ?? '',
          purchased: stay.status === 'Purchased',
          facts: [stay.status].filter((value) => value !== null),
        },
        [
          ['checkIn', stay.timing.arrival, stay.timing.checkIn, stay.timing.timeZone],
          ['checkOut', stay.timing.departure, stay.timing.checkOut, stay.timing.timeZone],
        ],
        true
      )
    ),
    ...snapshot.events.flatMap((event) =>
      sourceEndpoints(
        {
          source: { kind: 'event', id: event.id },
          title: event.name ?? '',
          purchased: event.purchase === 'Purchased',
          facts: [event.intention, event.arrangement, event.purchase].filter(
            (value) => value !== null
          ),
        },
        [
          ['start', event.timing.start, event.timing.startTime, event.timing.timeZone],
          ['end', event.timing.end, event.timing.endTime, event.timing.timeZone],
        ]
      )
    ),
  ];
}

function journeyEntries({
  journey,
  legs,
  timing,
}: CalendarSnapshot['journeys'][number]): CalendarEntry[] {
  const source = { kind: 'journey', id: journey.id } as const;
  const title = journey.name ?? '';
  if (!legs.length)
    return [
      {
        key: `journey:${journey.id}`,
        source,
        title,
        boundary: 'unknown',
        instant: null,
        purchased: false,
        facts: [],
        conflict: false,
      },
    ];
  return legs.flatMap((leg) => {
    const resolved = timing.legs.find((item) => item.legId === leg.id);
    if (!resolved) throw new Error('Missing owning leg timing');
    return (
      [
        ['from', 'departure', resolved.departure],
        ['to', 'arrival', resolved.arrival],
      ] as const
    ).map(([side, boundary, instant]) => ({
      key: `leg:${leg.id}:${boundary}`,
      source,
      title,
      boundary,
      date: leg[side].date ?? leg[side].local?.slice(0, 10),
      clock: leg[side].local?.slice(11),
      zone: leg[side].timeZone,
      instant,
      ...(side === 'from' && leg.from.local !== undefined && leg.to.local !== undefined
        ? {
            endDate: leg.to.local?.slice(0, 10),
            endInstant: resolved.arrival,
            endExclusive: true,
          }
        : {}),
      purchased: leg.purchase === 'Purchased',
      facts: [leg.mode, leg[side].sourceLabel, leg.intention, leg.arrangement, leg.purchase].filter(
        (value) => value !== null && value !== undefined
      ),
      conflict: timing.findings.some((finding) => finding.legIds.includes(leg.id)),
    }));
  });
}
