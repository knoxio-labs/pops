import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pops/ui';

import { calendarDate, calendarStamp } from '../trip-calendar/format';
import { arrangementDateLabel } from './format';
import { ArrangementPolicyDetails } from './policy-details';
import { ArrangementResponsibility } from './responsibility-picker';

import type { ReactNode } from 'react';

import type { CalendarBooking } from '../trip-route-editing/calendar-types';
import type { ArrangementRow } from './model';

/** Opens the exact selected arrangement's source fields without navigating to another fixture. */
export function ArrangementSource({
  row,
  children,
}: {
  row: ArrangementRow;
  children?: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Open ${row.name}`}
          className={
            children
              ? 'block h-auto min-h-11 w-full cursor-pointer whitespace-normal rounded-none p-3 text-left font-normal focus-visible:ring-inset'
              : 'min-h-11'
          }
        >
          {children ?? row.name}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.name}</DialogTitle>
          <DialogDescription>{row.visitName}</DialogDescription>
        </DialogHeader>
        <ArrangementSourceDetails row={row} />
      </DialogContent>
    </Dialog>
  );
}

function ArrangementSourceDetails({ row }: { row: ArrangementRow }) {
  const notes = row.source.kind === 'record' ? row.source.record.notes : '';
  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2">
        {row.intention && <SourceFact label="Intent" value={row.intention} />}
        {row.status && (
          <SourceFact
            label="Booking state"
            value={row.status === 'Not needed' ? 'No booking needed' : row.status}
          />
        )}
        {row.purchased && row.status !== 'Purchased' && (
          <SourceFact label="Purchase" value="Purchased" />
        )}
        {arrangementDateLabel(row) && (
          <SourceFact label="Dates" value={arrangementDateLabel(row)} />
        )}
        {notes && <SourceFact label="Notes" value={notes} />}
      </dl>
      <ArrangementResponsibility row={row} />
      {row.bookings.map((booking) => (
        <BookingClocks key={booking.id} booking={booking} />
      ))}
      {row.policy && <ArrangementPolicyDetails policy={row.policy} />}
    </div>
  );
}

function BookingClocks({ booking }: { booking: CalendarBooking }) {
  const stamp = (at: string, zone: string) =>
    booking.allDay ? calendarDate(at.slice(0, 10)) : calendarStamp(at, zone);
  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h3 className="text-sm font-medium">{booking.title}</h3>
      <dl className="space-y-2">
        <SourceFact
          label={booking.kind === 'flight' ? 'Departure' : 'Start'}
          value={stamp(booking.startAt, booking.timeZone)}
        />
        {booking.endAt && (
          <SourceFact
            label={booking.kind === 'flight' ? 'Arrival' : 'End'}
            value={stamp(booking.endAt, booking.endTimeZone ?? booking.timeZone)}
          />
        )}
      </dl>
    </section>
  );
}

function SourceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
