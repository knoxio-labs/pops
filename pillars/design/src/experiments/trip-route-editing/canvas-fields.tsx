import { formatCityTiming } from '@/fixtures/trip-overview-format';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

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
      <TextInput
        aria-label="City / region"
        key={`${record.id}-${record.placeId}`}
        defaultValue={name}
        variant="ghost"
        containerClassName="bg-transparent px-0 hover:bg-accent/40 focus-within:bg-accent/40"
        className="text-xl font-semibold text-foreground md:text-xl"
        onBlur={(e) => change(renamePlace(state, record.id, e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {showTiming && <VisitTiming record={record} />}
    </div>
  );
}

/** Edit a visit's date precision from its displayed date value. */
export function VisitTiming({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Edit timing"
          className="min-h-11 w-full justify-end whitespace-normal px-0 text-right text-sm font-normal text-muted-foreground"
        >
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
  );
}
