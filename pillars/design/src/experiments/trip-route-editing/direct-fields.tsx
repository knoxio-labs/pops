import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { tripPlaces } from '@/fixtures/trip-places';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Select } from '@pops/ui';

import { TimingFields } from './timing-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Names and timing edit in place; choosing a value updates the local route immediately. */
export function DirectFields({
  record,
  onChange,
}: {
  record: TripRecord;
  onChange: (record: TripRecord) => void;
}) {
  const timing = record.timing ?? {};
  const label = formatCityTiming(timing);
  const invalid = Boolean(timing.arrival && timing.departure && timing.arrival > timing.departure);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Select
        aria-label="City / region"
        variant="ghost"
        value={record.placeId}
        className="font-bold text-lg"
        options={tripPlaces
          .filter((p) => p.kind !== 'airport')
          .map((p) => ({ value: p.id, label: p.name }))}
        onChange={(e) => onChange({ ...record, placeId: e.target.value })}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="min-h-11 px-3" aria-label="Edit timing">
            <CalendarDays className="size-4" aria-hidden />
            {label || 'Add dates'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <TimingFields
            timing={timing}
            onChange={(next) => onChange({ ...record, timing: next })}
          />
          {invalid && (
            <p role="alert" className="text-sm text-destructive">
              Departure precedes arrival.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Changes apply immediately.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
