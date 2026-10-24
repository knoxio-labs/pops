import { bookingDay, calendarDay, hasPreciseTime, instant, validBooking } from './calendar-time';

export { bookingDay } from './calendar-time';

import type { CalendarBooking, CalendarEntry, TimingFinding, TimingRule } from './calendar-types';

export type { CalendarBooking, CalendarEntry, TimingFinding, TimingRule } from './calendar-types';

function ruleFinding(
  rule: TimingRule,
  byId: ReadonlyMap<string, CalendarBooking>
): TimingFinding | undefined {
  const from = byId.get(rule.fromId);
  const to = byId.get(rule.toId);
  const recordIds = [...new Set([from?.recordId, to?.recordId].filter((id) => id !== undefined))];
  if (!from || !to)
    return { id: rule.id, recordIds, message: `${rule.id}: missing linked booking` };
  if (!hasPreciseTime(from) || !hasPreciseTime(to)) return undefined;
  if (!Number.isFinite(rule.minimumMinutes) || rule.minimumMinutes < 0) {
    return { id: rule.id, recordIds, message: `${rule.id}: invalid minimum minutes` };
  }
  if (!from.endAt) return { id: rule.id, recordIds, message: `${from.title}: end time required` };
  const availableMinutes = (instant(to.startAt) - instant(from.endAt)) / 60_000;
  if (availableMinutes >= rule.minimumMinutes) return undefined;
  return {
    id: rule.id,
    recordIds,
    message: `${from.recordId === to.recordId ? 'Connection' : `${from.title} → ${to.title}`}: ${availableMinutes} min available · ${rule.minimumMinutes} min configured`,
    availableMinutes,
    requiredMinutes: rule.minimumMinutes,
  };
}

/** Finds invalid data, short gaps and overlapping precise commitments; all-day dates claim no times. */
export function timingFindings(
  bookings: readonly CalendarBooking[],
  rules: readonly TimingRule[]
): TimingFinding[] {
  const findings: TimingFinding[] = [];
  for (const booking of bookings) {
    if (!validBooking(booking)) {
      findings.push({
        id: `invalid-${booking.id}`,
        recordIds: [booking.recordId],
        message: `${booking.title}: invalid date, time zone or interval`,
      });
    }
  }
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  for (const rule of rules) {
    const finding = ruleFinding(rule, byId);
    if (finding) findings.push(finding);
  }
  const commitments = bookings.filter(
    (booking) => hasPreciseTime(booking) && (booking.kind === 'flight' || booking.kind === 'event')
  );
  for (const [index, left] of commitments.entries()) {
    for (const right of commitments.slice(index + 1)) {
      if (
        left.endAt &&
        right.endAt &&
        instant(left.startAt) < instant(right.endAt) &&
        instant(right.startAt) < instant(left.endAt)
      ) {
        findings.push({
          id: `overlap-${left.id}-${right.id}`,
          recordIds: [...new Set([left.recordId, right.recordId])],
          message: `${left.title} / ${right.title}: overlapping times`,
        });
      }
    }
  }
  return findings;
}

function shiftDay(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Includes one local day before departure and after arrival for all legs of a record. */
export function flightWindow(
  bookings: readonly CalendarBooking[],
  recordId: string
): { from: string; to: string } {
  const legs = bookings
    .filter((booking) => booking.recordId === recordId && booking.kind === 'flight')
    .toSorted((left, right) => instant(left.startAt) - instant(right.startAt));
  const first = legs[0];
  const last = legs.at(-1);
  if (!first || !last || legs.some((leg) => !validBooking(leg) || !leg.endAt) || !last.endAt) {
    throw new Error(`Invalid or missing flight interval: ${recordId}`);
  }
  return {
    from: shiftDay(bookingDay(first.startAt, first.timeZone), -1),
    to: shiftDay(bookingDay(last.endAt, last.endTimeZone ?? last.timeZone), 1),
  };
}

function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

function calendarBounds(start: string, end: string): { earliest: string; latest: string } {
  return { earliest: start < end ? start : end, latest: start > end ? start : end };
}

function entriesForBooking(booking: CalendarBooking, from: string, to: string): CalendarEntry[] {
  if (!validBooking(booking)) return [];
  const startDay = calendarDay(booking, booking.startAt, booking.timeZone);
  const endZone = booking.endTimeZone ?? booking.timeZone;
  const endDay = booking.endAt ? calendarDay(booking, booking.endAt, endZone) : startDay;
  const { earliest, latest } = calendarBounds(startDay, endDay);
  if (earliest > to || latest < from) return [];
  const entries: CalendarEntry[] = [];
  if (inRange(startDay, from, to)) {
    entries.push({
      booking,
      day: startDay,
      at: booking.startAt,
      zone: booking.timeZone,
      boundary: 'start',
    });
  }
  if (booking.endAt && inRange(endDay, from, to)) {
    entries.push({ booking, day: endDay, at: booking.endAt, zone: endZone, boundary: 'end' });
  }
  if (earliest < from && latest > to) {
    entries.push({
      booking,
      day: from,
      at: booking.startAt,
      zone: booking.timeZone,
      boundary: 'continuing',
    });
  }
  return entries;
}

/** Projects visible local boundaries and ongoing intervals, without repeated nights. */
export function calendarEntries(
  bookings: readonly CalendarBooking[],
  from: string,
  to: string
): CalendarEntry[] {
  if (from > to) return [];
  return bookings
    .flatMap((booking) => entriesForBooking(booking, from, to))
    .toSorted(
      (left, right) => left.day.localeCompare(right.day) || instant(left.at) - instant(right.at)
    );
}
