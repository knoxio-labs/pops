import { isPurchasedArrangement } from '@/fixtures/trip-overview-model';

import { calendarBookings, calendarRules } from './calendar-fixtures';
import { initialCanvas, canvasName } from './canvas-model';
import { localDateTime, zonedInstant } from './canvas-zoned-time';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CalendarBooking, TimingRule } from './calendar-model';
import type { CanvasState, RentalPeriod } from './canvas-model';

const sources = initialCanvas('default').records;

function dateValue(day: string): number {
  const value = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day
    ? value
    : Number.NaN;
}

function shiftFromSource(
  at: string,
  current: string | undefined,
  original: string | undefined,
  zone: string
): string {
  if (current === undefined) return at;
  const local = localDateTime(at, zone);
  const delta = dateValue(current) - dateValue(original ?? local.slice(0, 10));
  const shifted = new Date(dateValue(local.slice(0, 10)) + delta);
  const day = Number.isFinite(shifted.getTime()) ? shifted.toISOString().slice(0, 10) : current;
  const wall = `${day}${local.slice(10)}`;
  return zonedInstant(wall, zone) ?? wall;
}

function sourceStart(booking: CalendarBooking, record: TripRecord, originalStart?: string): string {
  let startAt = shiftFromSource(
    booking.startAt,
    record.schedule?.start,
    originalStart,
    booking.timeZone
  );
  const first = calendarBookings.find((item) => item.recordId === record.id);
  if (record.schedule?.localTime && first?.id === booking.id) {
    const wall = `${startAt.slice(0, 11)}${record.schedule.localTime}`;
    startAt = zonedInstant(wall, booking.timeZone) ?? wall;
  }
  return startAt;
}

function sourceEnd(
  booking: CalendarBooking,
  record: TripRecord,
  originalStart?: string
): string | undefined {
  if (!booking.endAt) return undefined;
  const original = sources.find((item) => item.id === record.id)?.schedule;
  const last = calendarBookings.filter((item) => item.recordId === record.id).at(-1);
  if (booking.id === last?.id && record.schedule?.end) {
    return shiftFromSource(
      booking.endAt,
      record.schedule.end,
      original?.end ?? booking.endAt.slice(0, 10),
      booking.endTimeZone ?? booking.timeZone
    );
  }
  return shiftFromSource(
    booking.endAt,
    record.schedule?.start,
    originalStart,
    booking.endTimeZone ?? booking.timeZone
  );
}

function preciseBooking(state: CanvasState, booking: CalendarBooking): CalendarBooking[] {
  const record = state.records.find((r) => r.id === booking.recordId);
  if (!record || state.rentals.some((rental) => rental.id === record.id)) return [];
  const original = sources.find((r) => r.id === record.id)?.schedule;
  if (original && !record.schedule) return [];
  const first = calendarBookings.find((item) => item.recordId === record.id);
  const originalStart = original?.start ?? first?.startAt.slice(0, 10);
  return [
    {
      ...booking,
      title: record.title ?? booking.title,
      startAt: sourceStart(booking, record, originalStart),
      endAt: sourceEnd(booking, record, originalStart),
      purchased: isPurchasedArrangement(record),
      ...state.clockOverrides[booking.id],
    },
  ];
}

function datedBooking(state: CanvasState, record: TripRecord): CalendarBooking[] {
  if (!record.schedule || record.kind === 'city') return [];
  return [
    {
      id: record.id,
      recordId: record.id,
      title: canvasName(state, record),
      kind: record.kind === 'stay' ? 'stay' : 'event',
      location: state.places.find((place) => place.id === record.placeId)?.name ?? '',
      startAt: `${record.schedule.start}T00:00:00Z`,
      endAt: record.schedule.end ? `${record.schedule.end}T00:00:00Z` : undefined,
      timeZone: 'UTC',
      allDay: true,
      purchased: isPurchasedArrangement(record),
    },
  ];
}

function rentalBooking(state: CanvasState, rental: RentalPeriod): CalendarBooking[] {
  if (!rental.start && !rental.end) return [];
  const record = state.records.find((item) => item.id === rental.id);
  return [
    {
      id: rental.id,
      recordId: rental.id,
      title: record?.title ?? rental.provider,
      kind: 'rental',
      location:
        state.places.find(
          (place) => place.id === state.records.find((item) => item.id === rental.from)?.placeId
        )?.name ?? rental.from,
      startAt: `${rental.start}T00:00:00Z`,
      endAt: `${rental.end}T00:00:00Z`,
      timeZone: 'UTC',
      allDay: true,
      purchased: record ? isPurchasedArrangement(record) : rental.status === 'Purchased',
    },
  ];
}

/** Project current source dates and purchase state; explicit clock edits override shifted sample instants. */
export function canvasCalendar(state: CanvasState): CalendarBooking[] {
  const precise = calendarBookings.flatMap((booking) => preciseBooking(state, booking));
  const known = new Set([
    ...precise.map((booking) => booking.recordId),
    ...state.rentals.map((rental) => rental.id),
  ]);
  const dated = state.records
    .filter((record) => !known.has(record.id))
    .flatMap((record) => datedBooking(state, record));
  const rentals = state.rentals.flatMap((rental) => rentalBooking(state, rental));
  return [...precise, ...dated, ...rentals];
}

/** Buffer minutes are explicit editable inputs, never inferred airport policy. */
export function canvasTimingRules(state: CanvasState): TimingRule[] {
  return calendarRules.map((rule) => ({
    ...rule,
    minimumMinutes: state.buffers[rule.id] ?? rule.minimumMinutes,
  }));
}
