import { Temporal } from '@js-temporal/polyfill';

import { calendarInstant } from './time';

import type { CalendarEntry } from './types';

/** Resolve complete clocks; floating Event dates imply no occupancy. Published stay bounds and resolved instants may span a range. */
export function sourceEndpoints(
  common: Pick<CalendarEntry, 'source' | 'title' | 'purchased' | 'facts'>,
  endpoints: [
    CalendarEntry['boundary'],
    string | undefined,
    string | undefined,
    string | undefined,
  ][],
  endExclusive?: boolean
): CalendarEntry[] {
  const rows = endpoints.filter(([, date, clock]) => date !== undefined || clock !== undefined);
  if (!rows.length)
    return [
      {
        ...common,
        key: `${common.source.kind}:${common.source.id}`,
        boundary: 'unknown',
        zone: endpoints.at(0)?.[3],
        instant: null,
        conflict: false,
      },
    ];
  const result = rows.map(([boundary, date, clock, zone]) => ({
    ...common,
    key: `${common.source.kind}:${common.source.id}:${boundary}`,
    boundary,
    date,
    clock,
    zone,
    instant: calendarInstant(date, clock, zone),
    conflict: false,
  }));
  const last = result.at(-1);
  const reversed = reversedEndpoints(result);
  return result.map((entry, index) => ({
    ...entry,
    ...(index === 0 &&
    result.length > 1 &&
    (endExclusive !== undefined || (entry.instant !== null && last?.instant !== null))
      ? { endDate: last?.date, endInstant: last?.instant, endExclusive }
      : {}),
    conflict: reversed || unresolvedComplete(entry),
  }));
}
function unresolvedComplete(entry: CalendarEntry): boolean {
  return Boolean(entry.date && entry.clock && entry.zone && entry.instant === null);
}
function reversedEndpoints(entries: CalendarEntry[]): boolean {
  const first = entries.at(0);
  const last = entries.at(-1);
  if (!first || !last || first === last) return false;
  if (first.instant !== null && last.instant !== null)
    return Temporal.Instant.compare(first.instant, last.instant) > 0;
  return first.date !== undefined && last.date !== undefined && first.date > last.date;
}
