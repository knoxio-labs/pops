import { localDateTime } from '../trip-route-editing/canvas-zoned-time';
import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Formats a projected clock using the shared explicit-instant and IANA validator. */
export function calendarClock(at: string, zone: string): string {
  return localDateTime(at, zone).slice(11);
}

/** Formats explicit source instants in their own zones, retaining the zone identifier. */
export function calendarStamp(at: string, zone: string): string {
  if (!localDateTime(at, zone)) return `Invalid source time: ${at} · ${zone}`;
  try {
    const date = new Intl.DateTimeFormat('en-AU', {
      timeZone: zone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(at));
    return `${date} · ${calendarClock(at, zone)} · ${zone}`;
  } catch {
    return `Invalid source time: ${at} · ${zone}`;
  }
}

/** Formats a floating date as a date only, independent of the selected display zone. */
export function calendarDate(day: string): string {
  if (!isTripDate(day)) return `Invalid source date: ${day}`;
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${day}T12:00:00Z`));
}
