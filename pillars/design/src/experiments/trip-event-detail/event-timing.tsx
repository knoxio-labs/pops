import { formatTripDate } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { useCanvas } from '../trip-route-editing/canvas-context';
import { isTripDate } from '../trip-route-editing/lodging-periods';
import { useEventDetails } from './model';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

/** Event date precision and optional clocks stay editable without requiring complete scheduling. */
export function EventTiming({ event }: { event: TripRecord }) {
  const start = event.schedule?.start ?? event.timing?.arrival;
  const end = event.schedule?.end ?? event.timing?.departure;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label="Edit event dates" className="font-semibold">
          <CalendarDays className="size-4 text-app-accent" aria-hidden />
          {eventDateLabel(start, end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <EventDates event={event} />
        <EventClocks />
      </PopoverContent>
    </Popover>
  );
}

function EventDates({ event }: { event: TripRecord }) {
  const { state, change } = useCanvas();
  const start = event.schedule?.start ?? event.timing?.arrival;
  const end = event.schedule?.end ?? event.timing?.departure;
  function update(field: 'arrival' | 'departure', value: string) {
    if (value && !isTripDate(value)) return;
    const dates = { arrival: start, departure: end, [field]: value || undefined };
    const arrival: TripDate | undefined = isTripDate(dates.arrival) ? dates.arrival : undefined;
    const departure: TripDate | undefined = isTripDate(dates.departure)
      ? dates.departure
      : undefined;
    change({
      ...state,
      records: state.records.map((r) =>
        r.id === event.id
          ? {
              ...r,
              timing: { ...r.timing, arrival, departure },
              schedule: arrival ? { ...r.schedule, start: arrival, end: departure } : undefined,
            }
          : r
      ),
    });
  }
  return (
    <>
      <TextInput
        label="Start date"
        type="date"
        value={start ?? ''}
        onInput={(e) => update('arrival', e.currentTarget.value)}
      />
      <TextInput
        label="End date"
        type="date"
        value={end ?? ''}
        onInput={(e) => update('departure', e.currentTarget.value)}
      />
      {start && end && start > end && (
        <p role="alert" className="text-sm text-destructive">
          End precedes start
        </p>
      )}
    </>
  );
}

function EventClocks() {
  const { data, change } = useEventDetails();
  const { metadata } = data;
  const zone = metadata.timeZone;
  let invalidZone = false;
  if (zone) {
    try {
      new Intl.DateTimeFormat('en-AU', { timeZone: zone });
    } catch {
      invalidZone = true;
    }
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <TextInput
          label="Start time"
          type="time"
          value={metadata.startTime ?? ''}
          onInput={(e) =>
            change({
              ...data,
              metadata: { ...metadata, startTime: e.currentTarget.value || undefined },
            })
          }
        />
        <TextInput
          label="End time"
          type="time"
          value={metadata.endTime ?? ''}
          onInput={(e) =>
            change({
              ...data,
              metadata: { ...metadata, endTime: e.currentTarget.value || undefined },
            })
          }
        />
      </div>
      <TextInput
        label="Time zone"
        value={zone ?? ''}
        placeholder="IANA time zone"
        onChange={(e) =>
          change({ ...data, metadata: { ...metadata, timeZone: e.target.value || undefined } })
        }
        error={invalidZone ? 'Invalid time zone' : undefined}
      />
    </>
  );
}

function eventDateLabel(start?: TripDate, end?: TripDate): string {
  if (start && end) return `${formatTripDate(start)} → ${formatTripDate(end)}`;
  if (start) return formatTripDate(start);
  return end ? `→ ${formatTripDate(end)}` : 'Add dates';
}
