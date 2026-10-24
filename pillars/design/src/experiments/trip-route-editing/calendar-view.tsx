import { BedDouble, CalendarDays, CarFront, Check, Plane } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import { calendarEntries } from './calendar-model';

import type { CalendarBooking, CalendarEntry, TimingFinding } from './calendar-model';

const icons = { flight: Plane, event: CalendarDays, stay: BedDouble, rental: CarFront };
const boundaries = {
  flight: { start: 'Departure', end: 'Arrival', continuing: 'In flight' },
  stay: { start: 'Check-in', end: 'Check-out', continuing: 'Stay' },
  event: { start: 'Start', end: 'End', continuing: 'Event' },
  rental: { start: 'Pick-up', end: 'Drop-off', continuing: 'Rental' },
};

function time(at: string, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
}

function stamp(at: string, zone: string, allDay = false): string {
  if (allDay) return at.slice(0, 10);
  return `${new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at))} · ${time(at, zone)} · ${zone}`;
}

function BookingRow({
  entry,
  findings,
  hourly,
}: {
  entry: CalendarEntry;
  findings: readonly TimingFinding[];
  hourly: boolean;
}) {
  const { booking } = entry;
  const Icon = icons[booking.kind];
  const related = findings.filter((finding) => finding.recordIds.includes(booking.recordId));
  const purchaseBorder = booking.purchased ? 'border-primary' : 'border-border';
  return (
    <article
      className={cn(
        'flex gap-3 rounded-lg border bg-card p-3',
        related.length > 0 ? 'border-destructive' : purchaseBorder,
        !booking.purchased && 'border-dashed'
      )}
    >
      {hourly && !booking.allDay && (
        <time dateTime={entry.at} className="w-14 shrink-0 pt-0.5 font-mono text-sm tabular-nums">
          {entry.boundary === 'continuing' ? '↔' : time(entry.at, entry.zone)}
        </time>
      )}
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{booking.title}</span>
          {booking.allDay && <Badge variant="outline">All day</Badge>}
          {booking.purchased && <Check className="size-4 text-primary" aria-label="Purchased" />}
        </div>
        <p className="text-sm text-muted-foreground">{booking.location}</p>
        <p className="text-xs font-medium">{boundaries[booking.kind][entry.boundary]}</p>
        <p className="text-xs tabular-nums">{stamp(entry.at, entry.zone, booking.allDay)}</p>
        {entry.boundary === 'continuing' && booking.endAt && (
          <p className="text-xs tabular-nums">
            → {stamp(booking.endAt, booking.endTimeZone ?? booking.timeZone, booking.allDay)}
          </p>
        )}
        {related.map((finding) => (
          <p key={finding.id} className="text-xs font-medium text-foreground">
            {finding.message}
          </p>
        ))}
      </div>
    </article>
  );
}

/** Shows every intersecting booking in local calendar order, retaining both endpoint zones. */
export function CalendarView({
  bookings,
  findings,
  from,
  to,
  scale,
}: {
  bookings: readonly CalendarBooking[];
  findings: readonly TimingFinding[];
  from: string;
  to: string;
  scale: 'days' | 'hours';
}) {
  const entries = calendarEntries(bookings, from, to);
  const days = [...new Set(entries.map((entry) => entry.day))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm tabular-nums">
        <time>{from}</time>
        <span>→</span>
        <time>{to}</time>
      </div>
      {days.map((day) => (
        <section key={day} className="space-y-2" aria-label={day}>
          <h3 className="border-b pb-2 text-sm font-semibold tabular-nums">{day}</h3>
          <div className="space-y-2">
            {entries
              .filter((entry) => entry.day === day)
              .map((entry) => (
                <BookingRow
                  key={`${entry.booking.id}-${entry.boundary}`}
                  entry={entry}
                  findings={findings}
                  hourly={scale === 'hours'}
                />
              ))}
          </div>
        </section>
      ))}
      {findings
        .filter((finding) => finding.recordIds.length === 0)
        .map((finding) => (
          <p key={finding.id} role="alert" className="text-sm text-foreground">
            {finding.message}
          </p>
        ))}
    </div>
  );
}
