import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { renamePlace } from './canvas-actions';
import { useCanvas } from './canvas-context';
import { canvasName } from './canvas-model';
import { TimingFields } from './timing-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Place names are editable text with reusable place records; dates retain explicit precision. */
export function CanvasFields({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  const name = canvasName(state, record);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <TextInput
        aria-label="City / region"
        key={`${record.id}-${record.placeId}`}
        defaultValue={name}
        variant="ghost"
        className="text-2xl font-semibold text-foreground md:text-2xl"
        onBlur={(e) => change(renamePlace(state, record.id, e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="Edit timing" className="min-h-11 px-3">
            <CalendarDays className="size-4" aria-hidden />
            {formatCityTiming(record.timing ?? {}) || 'Add dates'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <TimingFields
            timing={record.timing ?? {}}
            onChange={(timing) =>
              change({
                ...state,
                records: state.records.map((r) => (r.id === record.id ? { ...r, timing } : r)),
              })
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
