import { BedDouble, CalendarDays, CarFront, Plane, UsersRound } from 'lucide-react';

import { cn } from '@pops/ui';

import { calendarClock, calendarDate, calendarStamp } from './format';
import { AvailabilitySource, BookingSource } from './source';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CalendarEntry } from '../trip-route-editing/calendar-types';
import type { CalendarAvailability } from './model';

const icons = { flight: Plane, event: CalendarDays, stay: BedDouble, rental: CarFront };
const boundaries = {
  flight: { start: 'Departure', end: 'Arrival', continuing: 'In flight' },
  stay: { start: 'Check-in', end: 'Check-out', continuing: 'Stay' },
  event: { start: 'Start', end: 'End', continuing: 'Event' },
  rental: { start: 'Pick-up', end: 'Drop-off', continuing: 'Rental' },
};

/** Places the same source fact on a compact agenda row or a separate clock rail. */
export function CalendarRowFrame({
  layout,
  clock,
  Icon,
  children,
}: {
  layout: 'agenda' | 'timeline';
  clock: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  return layout === 'timeline' ? (
    <div className="flex gap-5">
      <aside className="relative w-20 shrink-0 border-r-2 border-dotted border-app-accent/60 pr-5 pt-4 text-right font-mono text-sm tabular-nums sm:w-24">
        {clock}
        <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </aside>
      <div className="min-w-0 flex-1 py-2">{children}</div>
    </div>
  ) : (
    <div className="flex items-start gap-3 py-2">
      <div className="flex w-16 shrink-0 flex-col items-center gap-1 pt-2 font-mono text-sm tabular-nums">
        <Icon className="size-4" aria-hidden />
        <span>{clock}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Shows display-zone ordering alongside the original source flight endpoint clocks. */
export function CalendarBookingRow({
  entry,
  layout,
}: {
  entry: CalendarEntry;
  layout: 'agenda' | 'timeline';
}) {
  const { booking } = entry;
  let clock = calendarClock(entry.at, entry.zone);
  if (entry.boundary === 'continuing') clock = 'Ongoing';
  if (booking.allDay) clock = 'All day';
  return (
    <CalendarRowFrame layout={layout} clock={clock} Icon={icons[booking.kind]}>
      <article
        aria-label={`${booking.title} ${boundaries[booking.kind][entry.boundary]}`}
        className={cn(
          'rounded-xl border bg-card',
          booking.purchased
            ? 'border-solid border-foreground/40'
            : 'border-dashed border-foreground/30'
        )}
      >
        <BookingSource
          booking={booking}
          compact={layout === 'agenda'}
          triggerLabel={`Open ${booking.title} ${boundaries[booking.kind][entry.boundary]}`}
        >
          <span className="block text-sm font-semibold text-foreground">{booking.title}</span>
          <span className="block text-xs text-muted-foreground">
            {boundaries[booking.kind][entry.boundary]}
            {booking.purchased ? ' · Purchased' : ''}
          </span>
          {booking.location && <span className="block text-sm">{booking.location}</span>}
          {booking.kind === 'flight' && <FlightClocks entry={entry} />}
        </BookingSource>
      </article>
    </CalendarRowFrame>
  );
}

function FlightClocks({ entry }: { entry: CalendarEntry }) {
  const sourceZone =
    entry.boundary === 'end'
      ? (entry.booking.endTimeZone ?? entry.booking.timeZone)
      : entry.booking.timeZone;
  return (
    <span className="block text-xs text-muted-foreground">
      {calendarStamp(entry.at, sourceZone)}
    </span>
  );
}

/** Keeps inclusive contact availability as floating dates and a dashed visual tier. */
export function CalendarAvailabilityRow({
  availability,
  layout,
}: {
  availability: CalendarAvailability;
  layout: 'agenda' | 'timeline';
}) {
  return (
    <CalendarRowFrame layout={layout} clock="Dates" Icon={UsersRound}>
      <article
        aria-label={`${availability.name} availability`}
        className={cn('rounded-xl border border-dashed border-foreground/30 bg-muted/30')}
      >
        <AvailabilitySource availability={availability} compact={layout === 'agenda'}>
          <span className="block text-sm font-semibold">{availability.name}</span>
          <span className="block text-xs text-muted-foreground">{availability.status}</span>
          {availability.city && <span className="block text-sm">{availability.city}</span>}
          <span className="block text-xs">
            {calendarDate(availability.from)} — {calendarDate(availability.to)}
          </span>
        </AvailabilitySource>
      </article>
    </CalendarRowFrame>
  );
}
