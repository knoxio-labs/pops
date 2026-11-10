import { Temporal } from '@js-temporal/polyfill';

/** Resolve published minute-precision stay/event clocks, rejecting skipped/repeated times like owning journey timing. */
export function calendarInstant(date?: string, clock?: string, zone?: string): string | null {
  if (
    !date ||
    !clock ||
    !zone ||
    !validDate(date) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(clock) ||
    !validZone(zone)
  )
    return null;
  try {
    return Temporal.PlainDateTime.from(`${date}T${clock}`, { overflow: 'reject' })
      .toZonedDateTime(zone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Validate a display zone without silently using the browser's zone. */
export function validZone(zone: string): boolean {
  if (!zone || /^[+-]/u.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone.length > 0;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** Display a resolved instant in the explicitly chosen zone, retaining floating source dates separately. */
export function displayDate(instant: string, zone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
}

/** Validate actual calendar bounds, including leap days, without normalizing them. */
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  try {
    return Temporal.PlainDate.from(value, { overflow: 'reject' }).toString() === value;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
