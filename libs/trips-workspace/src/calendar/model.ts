import { Temporal } from '@js-temporal/polyfill';

import { clipEntry, compareEntries } from './filter';
import { activeJourneys } from './membership';
import { calendarEntries } from './projection';
import { validDate, validZone } from './time';

import type { CalendarEntry, CalendarSelection, CalendarSnapshot } from './types';

export { activeJourneys } from './membership';
export { calendarEntries } from './projection';

/** Validate explicit controls and selected authoritative bounds before projecting any rows. */
export function selectionProblem(
  selection: CalendarSelection,
  snapshot: CalendarSnapshot
): 'zone' | 'range' | 'window' | undefined {
  if (!validZone(selection.zone)) return 'zone';
  if (!validBounds(selection)) return 'range';
  if (selection.journey && !usableJourney(selection.journey, snapshot)) return 'window';
  return undefined;
}
function validBounds(selection: CalendarSelection): boolean {
  if (selection.from && !validDate(selection.from)) return false;
  if (selection.to && !validDate(selection.to)) return false;
  return !selection.from || !selection.to || selection.from <= selection.to;
}
function usableJourney(id: string, snapshot: CalendarSnapshot): boolean {
  return activeJourneys(snapshot).some(
    ({ journey, timing }) =>
      String(journey.id) === id &&
      timing.window !== null &&
      Temporal.Instant.compare(timing.window.from, timing.window.toExclusive) < 0
  );
}

/** Inclusive date bounds and half-open authoritative journey bounds; no iteration over calendar days. */
export function visibleEntries(
  snapshot: CalendarSnapshot,
  selection: CalendarSelection
): CalendarEntry[] {
  if (selectionProblem(selection, snapshot)) return [];
  const window = activeJourneys(snapshot).find(
    ({ journey }) => String(journey.id) === selection.journey
  )?.timing.window;
  return calendarEntries(snapshot)
    .flatMap((entry) => clipEntry(entry, selection, window))
    .toSorted(compareEntries);
}
