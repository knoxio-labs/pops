import { calendarEntries } from '../trip-route-editing/calendar-model';
import { calendarDay, validBooking } from '../trip-route-editing/calendar-time';
import { canvasCalendar } from '../trip-route-editing/canvas-calendar';
import { localDateTime } from '../trip-route-editing/canvas-zoned-time';
import { accommodationPeriods, isTripDate } from '../trip-route-editing/lodging-periods';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

import type { CalendarBooking, CalendarEntry } from '../trip-route-editing/calendar-model';
import type { CanvasState, RentalPeriod } from '../trip-route-editing/canvas-model';
import type { AccommodationPeriod } from '../trip-route-editing/lodging-periods';

/** One editable source record at its local day boundary; clock absence stays explicit. */
export interface VisitDayEntry {
  id: string;
  record: TripRecord;
  time?: string;
  zone?: string;
  direction?: 'Arrive' | 'Depart';
  stayBoundary?: 'Check-in' | 'Check-out';
}

/** Date-only hire boundary or a continuing local hire period, without invented pickup times. */
export interface VisitDayRental {
  rental: RentalPeriod;
  boundary: 'Pickup' | 'Return' | 'Continuing';
}

/** A day's activities and transport, plus the checkout-exclusive accommodation night. */
export interface VisitDay {
  entries: VisitDayEntry[];
  accommodation?: AccommodationPeriod;
  undated: TripRecord[];
  rentals: VisitDayRental[];
}

/** Apply saved visual order by entry identity; newly added rows retain their source order. */
export function orderVisitDayEntries(
  entries: readonly VisitDayEntry[],
  saved: readonly string[] = []
): VisitDayEntry[] {
  const position = (id: string): number => (saved.includes(id) ? saved.indexOf(id) : saved.length);
  return entries.toSorted((left, right) => position(left.id) - position(right.id));
}

/** Mark both adjacent clock-bearing rows when visual order reverses their displayed local times. */
export function dayClockIssues(entries: readonly VisitDayEntry[]): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  let previous: { id: string; time: string; minutes: number } | undefined;
  for (const entry of entries) {
    if (!entry.time || !/^\d{1,2}:\d{2}$/.test(entry.time)) continue;
    const [hours, minutes] = entry.time.split(':').map(Number);
    if (hours === undefined || minutes === undefined || hours > 23 || minutes > 59) continue;
    const clock = hours * 60 + minutes;
    if (previous && clock < previous.minutes) {
      const message = `${entry.time} < ${previous.time}`;
      issues[previous.id] = [...(issues[previous.id] ?? []), message];
      issues[entry.id] = [...(issues[entry.id] ?? []), message];
    }
    previous = { id: entry.id, time: entry.time, minutes: clock };
  }
  return issues;
}

function transportBoundary(
  state: CanvasState,
  visit: TripRecord,
  entry: CalendarEntry,
  bookings: CalendarBooking[]
): VisitDayEntry['direction'] {
  const link = state.transitLinks[entry.booking.recordId];
  if (!link) return undefined;
  const legs = bookings
    .filter((booking) => booking.recordId === entry.booking.recordId)
    .toSorted((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  if (link.from === visit.id && entry.boundary === 'start' && entry.booking.id === legs[0]?.id)
    return 'Depart';
  if (link.to === visit.id && entry.boundary === 'end' && entry.booking.id === legs.at(-1)?.id)
    return 'Arrive';
  return undefined;
}

function dayEntry(
  state: CanvasState,
  visit: TripRecord,
  entry: CalendarEntry,
  bookings: CalendarBooking[]
): VisitDayEntry[] {
  const record = state.records.find((item) => item.id === entry.booking.recordId);
  if (!record) return [];
  const direction =
    record.kind === 'transport' ? transportBoundary(state, visit, entry, bookings) : undefined;
  if (record.kind === 'transport' ? !direction : record.visitId !== visit.id) return [];
  if (!['transport', 'event', 'idea', 'person', 'stay'].includes(record.kind)) return [];
  if (!visibleBoundary(record, entry)) return [];
  const time = entryTime(entry, record);
  return [
    {
      id: `${entry.booking.id}:${entry.boundary}`,
      record,
      time,
      zone: !entry.booking.allDay && time ? entry.zone : undefined,
      direction,
      stayBoundary: stayBoundary(record, entry),
    },
  ];
}

function visibleBoundary(record: TripRecord, entry: CalendarEntry): boolean {
  if (record.kind === 'stay') return entry.boundary !== 'continuing';
  return record.kind === 'transport' || entry.boundary !== 'end';
}

function stayBoundary(record: TripRecord, entry: CalendarEntry): VisitDayEntry['stayBoundary'] {
  if (record.kind !== 'stay') return undefined;
  return entry.boundary === 'start' ? 'Check-in' : 'Check-out';
}

function entryTime(entry: CalendarEntry, record: TripRecord): string | undefined {
  if (entry.boundary === 'continuing') return undefined;
  if (entry.booking.allDay)
    return entry.boundary === 'start' ? record.schedule?.localTime : undefined;
  const local = localDateTime(entry.at, entry.zone);
  return local ? local.slice(11, 16) : undefined;
}

/** Select a local day without inventing appointment times or including checkout nights. */
export function visitDay(state: CanvasState, visit: TripRecord, day: TripDate): VisitDay {
  const bookings = canvasCalendar(state);
  const periods = accommodationPeriods(visit, state.records);
  const entries = calendarEntries(bookings, day, day)
    .flatMap((entry) => dayEntry(state, visit, entry, bookings))
    .toSorted((left, right) => (left.time ?? '').localeCompare(right.time ?? ''));
  return {
    entries,
    accommodation: periods.find(
      (period) => period.start && period.end && period.start <= day && day < period.end
    ),
    undated: state.records.filter(
      (record) =>
        record.visitId === visit.id &&
        ['event', 'idea', 'person'].includes(record.kind) &&
        !record.schedule
    ),
    rentals: dayRentals(state, visit, day),
  };
}

function dayRentals(state: CanvasState, visit: TripRecord, day: TripDate): VisitDayRental[] {
  return state.rentals.flatMap((rental) => {
    if (!isTripDate(rental.start) || !isTripDate(rental.end) || rental.start > rental.end)
      return [];
    const entries: VisitDayRental[] = [];
    if (rental.from === visit.id && day === rental.start)
      entries.push({ rental, boundary: 'Pickup' });
    if (rental.to === visit.id && day === rental.end) entries.push({ rental, boundary: 'Return' });
    if (
      rental.from === visit.id &&
      rental.to === visit.id &&
      rental.start < day &&
      day < rental.end
    )
      entries.push({ rental, boundary: 'Continuing' });
    return entries;
  });
}

function retainedDates(state: CanvasState, visit: TripRecord): TripDate[] {
  const bookings = canvasCalendar(state);
  return bookings.flatMap((booking) => {
    if (!validBooking(booking)) return [];
    const start = calendarDay(booking, booking.startAt, booking.timeZone);
    const end = booking.endAt
      ? calendarDay(booking, booking.endAt, booking.endTimeZone ?? booking.timeZone)
      : start;
    const record = state.records.find((item) => item.id === booking.recordId);
    if (!record) return [];
    if (record.kind !== 'transport')
      return record.visitId === visit.id ? [start, end].filter(isTripDate) : [];
    return calendarEntries([booking], start < end ? start : end, start > end ? start : end)
      .filter((entry) => transportBoundary(state, visit, entry, bookings))
      .map((entry) => entry.day)
      .filter(isTripDate);
  });
}

/** Enumerate exact visit dates including departure; absent bounds use retained local record dates. */
export function visitDayDates(visit: TripRecord, state: CanvasState): TripDate[] {
  const rentalDates = state.rentals.flatMap((rental) => [
    ...(rental.from === visit.id && isTripDate(rental.start) ? [rental.start] : []),
    ...(rental.to === visit.id && isTripDate(rental.end) ? [rental.end] : []),
  ]);
  const retained = [...retainedDates(state, visit), ...rentalDates].toSorted();
  const from = isTripDate(visit.timing?.arrival) ? visit.timing.arrival : retained[0];
  const to = isTripDate(visit.timing?.departure) ? visit.timing.departure : retained.at(-1);
  const start = from ?? to;
  const end = to ?? from;
  if (!start || !end || start > end) return [];
  const dates: TripDate[] = [];
  for (
    let timestamp = Date.parse(`${start}T00:00:00Z`);
    timestamp <= Date.parse(`${end}T00:00:00Z`);
    timestamp += 86_400_000
  ) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    if (isTripDate(date)) dates.push(date);
  }
  return dates;
}
