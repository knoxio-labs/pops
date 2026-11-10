import { formatCityTiming, presentTripRecord } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { BookingTimes } from './canvas-booking-times';
import { useCanvas } from './canvas-context';
import { TimingFields } from './timing-fields';

import type { TripCityTiming, TripRecord } from '@/fixtures/trip-overview-model';

/** Edit an activity title and explicit timing without changing its placement or place. */
export function ActivityFields({ item }: { item: TripRecord }) {
  const { state, change } = useCanvas();
  const display = presentTripRecord(item, state.records);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
      <div className="min-w-0 max-w-full">
        <TextInput
          aria-label={activityNameLabel(item)}
          variant="ghost"
          key={display.title}
          defaultValue={display.title}
          className="field-sizing-content min-w-0 max-w-full flex-none text-sm font-medium md:text-sm"
          containerClassName="w-fit bg-transparent px-0 hover:bg-transparent focus-within:bg-transparent"
          onBlur={(event) => {
            const title = event.currentTarget.value;
            if (title === display.title) return;
            change({
              ...state,
              records: state.records.map((record) =>
                record.id === item.id ? { ...record, title } : record
              ),
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      <ActivityTiming item={item} title={display.title} when={display.when} />
    </div>
  );
}

function ActivityTiming({ item, title, when }: { item: TripRecord; title: string; when: string }) {
  const { state, change } = useCanvas();
  const timing = {
    ...item.timing,
    arrival: item.schedule?.start ?? item.timing?.arrival,
    departure: item.schedule?.end ?? item.timing?.departure,
  };
  function updateTiming(next: TripCityTiming) {
    change({
      ...state,
      records: state.records.map((record) =>
        record.id === item.id
          ? {
              ...record,
              timing: next,
              schedule: next.arrival
                ? { ...record.schedule, start: next.arrival, end: next.departure }
                : undefined,
            }
          : record
      ),
    });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Edit dates for ${title}`}
          className="min-h-11 px-1 text-sm font-normal text-muted-foreground"
        >
          <CalendarDays className="size-4" aria-hidden />
          {when || formatCityTiming(timing)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <TimingFields timing={timing} onChange={updateTiming} />
        <BookingTimes recordId={item.id} />
      </PopoverContent>
    </Popover>
  );
}

function activityNameLabel(item: TripRecord): string {
  if (item.kind === 'stay') return 'Accommodation name';
  return item.kind === 'person' ? 'Person name' : 'Activity name';
}
