import { Temporal } from '@js-temporal/polyfill';

import { displayDate } from './time';

import type { CalendarEntry, CalendarSelection, CalendarSnapshot } from './types';

type Window = CalendarSnapshot['journeys'][number]['timing']['window'];

/** Clip only known noncontradictory source intervals; unknowns retain their original clock facts. */
export function clipEntry(
  entry: CalendarEntry,
  selection: CalendarSelection,
  window: Window | undefined
): CalendarEntry[] {
  if (selection.kind !== 'all' && entry.source.kind !== selection.kind) return [];
  const date = entry.instant === null ? entry.date : displayDate(entry.instant, selection.zone);
  const located = { ...entry, placementDate: date };
  if (entry.conflict) return [located];
  const dated = clipDate(located, selection);
  if (!dated) return [];
  const windowed = clipWindow(dated, window, selection.zone);
  return windowed ? [windowed] : [];
}
function clipDate(entry: CalendarEntry, selection: CalendarSelection): CalendarEntry | undefined {
  const date = entry.placementDate;
  if (!date) return entry;
  if (selection.to && date > selection.to) return undefined;
  if (!selection.from || date >= selection.from) return entry;
  if (!comparableEndpoints(entry)) return undefined;
  const endDate = entry.endInstant ? displayDate(entry.endInstant, selection.zone) : entry.endDate;
  if (!endDate || endDate < selection.from) return undefined;
  if (endDate === selection.from && exclusiveDayEnd(entry, selection.zone)) return undefined;
  return { ...entry, placementDate: selection.from, continuing: true };
}
function comparableEndpoints(entry: CalendarEntry): boolean {
  return (entry.instant !== null) === (typeof entry.endInstant === 'string');
}
function exclusiveDayEnd(entry: CalendarEntry, zone: string): boolean {
  if (!entry.endInstant) return entry.endExclusive === true;
  return Temporal.Instant.from(entry.endInstant)
    .toZonedDateTimeISO(zone)
    .toPlainTime()
    .equals('00:00');
}
function clipWindow(
  entry: CalendarEntry,
  window: Window | undefined,
  zone: string
): CalendarEntry | undefined {
  if (!window || entry.instant === null) return entry;
  if (Temporal.Instant.compare(entry.instant, window.toExclusive) >= 0) return undefined;
  if (Temporal.Instant.compare(entry.instant, window.from) >= 0) return entry;
  if (!entry.endInstant || Temporal.Instant.compare(entry.endInstant, window.from) <= 0)
    return undefined;
  const windowDate = displayDate(window.from, zone);
  const placementDate =
    entry.placementDate && entry.placementDate > windowDate ? entry.placementDate : windowDate;
  return { ...entry, placementDate, continuing: true };
}

/** Stable display-date and instant ordering without comparing independent floating clocks as instants. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  const dateOrder = (a.placementDate ?? '\uffff').localeCompare(b.placementDate ?? '\uffff');
  if (dateOrder) return dateOrder;
  if (a.instant === null && b.instant !== null) return 1;
  if (a.instant !== null && b.instant === null) return -1;
  if (a.instant !== null && b.instant !== null)
    return Temporal.Instant.compare(a.instant, b.instant) || a.key.localeCompare(b.key);
  return a.key.localeCompare(b.key);
}
