import type { CalendarSnapshot } from './types';

/** Exclude alternatives only through explicit published journey membership. */
export function activeJourneys(snapshot: CalendarSnapshot): CalendarSnapshot['journeys'] {
  const excluded = new Set(snapshot.groups.flatMap((group) => group.alternativeJourneyIds));
  const selected = new Set(snapshot.groups.map((group) => group.currentJourneyId));
  return snapshot.journeys.filter(
    ({ journey }) => !excluded.has(journey.id) || selected.has(journey.id)
  );
}
