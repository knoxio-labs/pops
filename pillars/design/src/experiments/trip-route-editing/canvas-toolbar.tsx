import { Button, DateRangeField, TextInput } from '@pops/ui';

import { flightWindow } from './calendar-model';
import { canvasCalendar, canvasTimingRules } from './canvas-calendar';
import { useCanvas } from './canvas-context';

import type { DateRangeValue } from '@pops/ui';

/** Presentation scale controls change projection, never the underlying route or bookings. */
export type CanvasScale = 'cities' | 'bookings' | 'days' | 'hours';

/** Date range and flight-window shortcuts are generated from the current booking records. */
export function CanvasToolbar({
  scale,
  setScale,
  range,
  setRange,
}: {
  scale: CanvasScale;
  setScale: (scale: CanvasScale) => void;
  range: DateRangeValue;
  setRange: (range: DateRangeValue) => void;
}) {
  const { state } = useCanvas();
  const bookings = canvasCalendar(state);
  const flightIds = [
    ...new Set(bookings.filter((b) => b.kind === 'flight').map((b) => b.recordId)),
  ];
  return (
    <div className="space-y-3 border-b pb-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="View granularity">
        {(['cities', 'bookings', 'days', 'hours'] as const).map((mode) => (
          <Button
            key={mode}
            variant={scale === mode ? 'secondary' : 'ghost'}
            aria-pressed={scale === mode}
            onClick={() => setScale(mode)}
          >
            {{ cities: 'Cities', bookings: 'Bookings', days: 'Days', hours: 'Hours' }[mode]}
          </Button>
        ))}
      </div>
      {(scale === 'days' || scale === 'hours') && (
        <DateRangeField value={range} onChange={setRange} startLabel="From" endLabel="To" />
      )}
      <div className="flex flex-wrap gap-2">
        {flightIds.map((id) => (
          <Button
            key={id}
            variant="outline"
            onClick={() => {
              const window = flightWindow(bookings, id);
              setRange({ start: window.from, end: window.to });
              setScale('hours');
            }}
          >
            {bookings
              .filter((b) => b.recordId === id)
              .map((b) => b.title)
              .join(' · ')}{' '}
            ±1 day
          </Button>
        ))}
      </div>
      <BufferFields />
    </div>
  );
}

function BufferFields() {
  const { state, change } = useCanvas();
  const rules = canvasTimingRules(state);
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Travel buffers</summary>
      <div className="grid gap-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <TextInput
            key={rule.id}
            label={`${rule.kind === 'connection' ? 'Connection' : 'Airport transfer'} · minutes`}
            type="number"
            min={0}
            value={rule.minimumMinutes}
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (Number.isFinite(minutes) && minutes >= 0)
                change({ ...state, buffers: { ...state.buffers, [rule.id]: minutes } });
            }}
          />
        ))}
      </div>
    </details>
  );
}
