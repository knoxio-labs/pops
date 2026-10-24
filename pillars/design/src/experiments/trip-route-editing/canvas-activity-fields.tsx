import { formatCityTiming, presentTripRecord } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { useCanvas } from './canvas-context';
import { TimingFields } from './timing-fields';

import type { TripCityTiming, TripRecord } from '@/fixtures/trip-overview-model';

/** Edit an activity title and explicit timing without changing its placement or place. */
export function ActivityFields({ item }: { item: TripRecord }) {
  const { state, change } = useCanvas();
  const display = presentTripRecord(item, state.records);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <TextInput
        aria-label={item.kind === 'stay' ? 'Accommodation name' : 'Activity name'}
        variant="ghost"
        key={display.title}
        defaultValue={display.title}
        className="text-sm font-semibold"
        onBlur={(event) =>
          change({
            ...state,
            records: state.records.map((record) =>
              record.id === item.id ? { ...record, title: event.currentTarget.value } : record
            ),
          })
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
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
          className="min-h-11 px-2 text-sm"
        >
          <CalendarDays className="size-4" aria-hidden />
          {when || formatCityTiming(timing) || 'Add dates'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <TimingFields timing={timing} onChange={updateTiming} />
      </PopoverContent>
    </Popover>
  );
}
