import {
  calendarEntries,
  flightWindow,
  timingFindings,
} from '../trip-route-editing/calendar-model';
import { instant, validBooking } from '../trip-route-editing/calendar-time';
import { localDateTime } from '../trip-route-editing/canvas-zoned-time';
import { isTripDate } from '../trip-route-editing/lodging-periods';

import type {
  CalendarBooking,
  CalendarEntry,
  TimingFinding,
  TimingRule,
} from '../trip-route-editing/calendar-types';

/** Inclusive floating contact availability; it claims calendar dates, never appointment instants. */
export interface CalendarAvailability {
  id: string;
  contactId: string;
  name: string;
  city: string;
  from: string;
  to: string;
  status: string;
}

/** Explicit source-kind filter; availability remains separate from bookings. */
export type CalendarKind = 'all' | 'availability' | CalendarBooking['kind'];

/** Independent source clocks and explicit display controls for a local calendar projection. */
export interface TripCalendarState {
  bookings: CalendarBooking[];
  rules: TimingRule[];
  availability: CalendarAvailability[];
  from: string;
  to: string;
  timeZone: string;
  kind: CalendarKind;
}

/** A selected local calendar date with source-backed bookings and separate floating availability. */
export interface CalendarDay {
  day: string;
  entries: CalendarEntry[];
  availability: CalendarAvailability[];
}

/** Fictional named review fixtures. */
export type CalendarScenario =
  | 'default'
  | 'flight-window'
  | 'empty'
  | 'missing-time'
  | 'invalid-range'
  | 'date-line';

function validZone(zone: string): boolean {
  return !/^[+-]/.test(zone) && Boolean(localDateTime('2000-01-01T12:00:00Z', zone));
}

/** Reports invalid explicit range or display zone inputs without supplying replacement dates or a UTC fallback. */
export function calendarInputFindings(state: TripCalendarState): { id: string; message: string }[] {
  const findings: { id: string; message: string }[] = [];
  if (!isTripDate(state.from)) findings.push({ id: 'from', message: 'Choose a valid start date.' });
  if (!isTripDate(state.to)) findings.push({ id: 'to', message: 'Choose a valid end date.' });
  if (isTripDate(state.from) && isTripDate(state.to) && state.from > state.to)
    findings.push({ id: 'range', message: 'Start date must be on or before end date.' });
  if (!validZone(state.timeZone))
    findings.push({ id: 'zone', message: 'Choose a valid IANA display time zone.' });
  return findings;
}

function displayBooking(booking: CalendarBooking, zone: string): CalendarBooking {
  return booking.allDay ? booking : { ...booking, timeZone: zone, endTimeZone: zone };
}

function dayEntries(state: TripCalendarState, day: string): CalendarEntry[] {
  if (state.kind === 'availability') return [];
  return state.bookings
    .filter(
      (booking) => (state.kind === 'all' || state.kind === booking.kind) && validBooking(booking)
    )
    .flatMap((booking) =>
      calendarEntries([displayBooking(booking, state.timeZone)], day, day).map((entry) => ({
        ...entry,
        booking,
      }))
    )
    .toSorted((left, right) => instant(left.at) - instant(right.at));
}

/** Accepts only complete, valid, inclusive floating date intervals, without assigning appointment times. */
export function validCalendarAvailability(source: CalendarAvailability): boolean {
  return isTripDate(source.from) && isTripDate(source.to) && source.from <= source.to;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Projects every selected date in the display zone, retaining source clocks and inclusive floating availability. */
export function tripCalendarDays(state: TripCalendarState): CalendarDay[] {
  if (calendarInputFindings(state).length) return [];
  const days: CalendarDay[] = [];
  for (let day = state.from; day <= state.to; day = nextDay(day)) {
    days.push({
      day,
      entries: dayEntries(state, day),
      availability:
        state.kind === 'all' || state.kind === 'availability'
          ? state.availability.filter(
              (source) =>
                validCalendarAvailability(source) && source.from <= day && day <= source.to
            )
          : [],
    });
    if (day === state.to) break;
  }
  return days;
}

/** Scopes timing findings to visible records while keeping invalid sources discoverable for the selected kind. */
export function tripCalendarFindings(state: TripCalendarState): TimingFinding[] {
  if (calendarInputFindings(state).length) return [];
  const visibleIds = new Set(
    tripCalendarDays(state).flatMap((day) => day.entries.map((entry) => entry.booking.recordId))
  );
  const invalidIds = new Set(
    state.bookings
      .filter(
        (booking) => !validBooking(booking) && (state.kind === 'all' || state.kind === booking.kind)
      )
      .map((booking) => `invalid-${booking.id}`)
  );
  const findings = timingFindings(state.bookings, state.rules).filter(
    (finding) => invalidIds.has(finding.id) || finding.recordIds.some((id) => visibleIds.has(id))
  );
  if (state.kind === 'all' || state.kind === 'availability') {
    for (const source of state.availability) {
      if (!validCalendarAvailability(source))
        findings.push({
          id: `availability-${source.id}`,
          recordIds: [],
          message: `${source.name}: invalid availability dates`,
        });
    }
  }
  return findings;
}

/** Selects one display-zone day before departure through one after arrival for all source legs of a flight. */
export function applyFlightWindow(
  state: TripCalendarState,
  recordId: string
): { state: TripCalendarState; error: string | null } {
  if (!validZone(state.timeZone)) return { state, error: 'Choose a valid IANA display time zone.' };
  const flights = state.bookings.filter(
    (booking) => booking.recordId === recordId && booking.kind === 'flight'
  );
  if (!flights.length || flights.some((booking) => !validBooking(booking) || !booking.endAt))
    return { state, error: 'Choose a flight with valid departure and arrival times.' };
  try {
    const range = flightWindow(
      flights.map((booking) => displayBooking(booking, state.timeZone)),
      recordId
    );
    if (!isTripDate(range.from) || !isTripDate(range.to))
      return { state, error: 'The flight window is outside valid calendar dates.' };
    return { state: { ...state, ...range }, error: null };
  } catch {
    return { state, error: 'Choose a flight with valid departure and arrival times.' };
  }
}
