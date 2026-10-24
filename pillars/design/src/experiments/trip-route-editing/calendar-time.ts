import type { CalendarBooking } from './calendar-model';

/** Parses only explicit-offset ISO instants; invalid input produces NaN. */
export function instant(value: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  ) {
    return Number.NaN;
  }
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    return Number.NaN;
  return Date.parse(value);
}

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Checks both endpoints and their declared display zones without filling missing times. */
export function validBooking(booking: CalendarBooking): boolean {
  const start = instant(booking.startAt);
  const end = booking.endAt === undefined ? start : instant(booking.endAt);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start &&
    validZone(booking.timeZone) &&
    validZone(booking.endTimeZone ?? booking.timeZone)
  );
}

/** Formats an instant as a sortable local calendar date in its declared zone. */
export function bookingDay(at: string, timeZone: string): string {
  if (!Number.isFinite(instant(at)) || !validZone(timeZone))
    throw new Error('Invalid booking time');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Preserves floating source dates for all-day records; precise records use their declared local zone. */
export function calendarDay(booking: CalendarBooking, at: string, zone: string): string {
  return booking.allDay ? at.slice(0, 10) : bookingDay(at, zone);
}

/** Narrows timing checks to valid arrangements that claim precise instants. */
export function hasPreciseTime(booking: CalendarBooking): boolean {
  return !booking.allDay && validBooking(booking);
}
