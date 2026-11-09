import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pops/ui';
import { Button, DialogTrigger } from '@pops/ui';

import { calendarDate, calendarStamp } from './format';

import type { ReactNode } from 'react';

import type { CalendarBooking } from '../trip-route-editing/calendar-types';
import type { CalendarAvailability } from './model';

/** Opens the exact selected booking's source fields, retaining both endpoint clocks and zones. */
export function BookingSource({
  booking,
  children,
  compact = false,
  triggerLabel,
}: {
  booking: CalendarBooking;
  children?: ReactNode;
  compact?: boolean;
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <SourceTrigger
        title={booking.title}
        label={triggerLabel ?? `Open ${booking.title}`}
        compact={compact}
      >
        {children}
      </SourceTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{booking.title}</DialogTitle>
          <DialogDescription>{booking.location}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 text-sm">
          <SourceFact
            label={booking.kind === 'flight' ? 'Departure' : 'Start'}
            value={
              booking.allDay
                ? calendarDate(booking.startAt.slice(0, 10))
                : calendarStamp(booking.startAt, booking.timeZone)
            }
          />
          {booking.endAt && (
            <SourceFact
              label={booking.kind === 'flight' ? 'Arrival' : 'End'}
              value={
                booking.allDay
                  ? calendarDate(booking.endAt.slice(0, 10))
                  : calendarStamp(booking.endAt, booking.endTimeZone ?? booking.timeZone)
              }
            />
          )}
          {booking.purchased && <SourceFact label="Commitment" value="Purchased" />}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the selected floating availability record without projecting dates into instants. */
export function AvailabilitySource({
  availability,
  children,
  compact = false,
}: {
  availability: CalendarAvailability;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Dialog>
      <SourceTrigger
        title={availability.name}
        label={`Open ${availability.name} availability`}
        compact={compact}
      >
        {children}
      </SourceTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{availability.name}</DialogTitle>
          <DialogDescription>{availability.city}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 text-sm">
          <SourceFact label="Availability" value={availability.status} />
          <SourceFact label="From" value={calendarDate(availability.from)} />
          <SourceFact label="Through" value={calendarDate(availability.to)} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function SourceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function SourceTrigger({
  title,
  label,
  children,
  compact,
}: {
  title: string;
  label: string;
  children?: ReactNode;
  compact: boolean;
}) {
  return (
    <DialogTrigger asChild>
      {children ? (
        <Button
          variant="ghost"
          type="button"
          aria-label={label}
          className={`block h-auto min-h-11 w-full cursor-pointer space-y-1 whitespace-normal rounded-xl text-left font-normal ${compact ? 'px-3 py-2' : 'p-3'}`}
        >
          {children}
        </Button>
      ) : (
        <Button variant="ghost" className="min-h-11" aria-label={label}>
          {title}
        </Button>
      )}
    </DialogTrigger>
  );
}
