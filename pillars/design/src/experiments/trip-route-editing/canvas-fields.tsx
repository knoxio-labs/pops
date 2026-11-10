import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput, cn } from '@pops/ui';

import { renamePlace } from './canvas-actions';
import { useCanvas } from './canvas-context';
import { canvasName } from './canvas-model';
import { TimingFields } from './timing-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Place names are editable text with reusable place records; dates retain explicit precision. */
export function CanvasFields({
  record,
  showTiming = true,
}: {
  record: TripRecord;
  showTiming?: boolean;
}) {
  const { state, change } = useCanvas();
  const name = canvasName(state, record);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
      <div className="min-w-24 max-w-full flex-initial">
        <TextInput
          aria-label="City / region"
          key={`${record.id}-${record.placeId}`}
          defaultValue={name}
          variant="ghost"
          containerClassName="bg-transparent px-0 hover:bg-transparent focus-within:bg-transparent"
          className="field-sizing-content min-w-0 max-w-full flex-none text-base font-semibold text-foreground md:text-base"
          onBlur={(e) => change(renamePlace(state, record.id, e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>
      {showTiming && <VisitTiming record={record} />}
    </div>
  );
}

/** Edit a visit's date precision from its displayed date value. */
export function VisitTiming({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  const timing = formatCityTiming(record.timing ?? {});
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Edit timing"
          className={cn(
            'min-h-11 min-w-11 max-w-full justify-start whitespace-normal px-1 text-left text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground',
            !timing &&
              'opacity-0 group-hover/visit:opacity-100 group-focus-within/visit:opacity-100 group-hover/route:opacity-100 group-focus-within/route:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
          )}
        >
          {timing || <CalendarDays className="size-4" aria-hidden />}
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
  );
}
