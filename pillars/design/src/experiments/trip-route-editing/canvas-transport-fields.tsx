import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { canvasCalendar } from './canvas-calendar';
import { useCanvas } from './canvas-context';
import { canvasName } from './canvas-model';
import { isTripDate } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Choose a known route visit by identity, retaining repeated places as distinct visits. */
export function CanvasVisitEndpoint({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const { state } = useCanvas();
  const visit = state.records.find((record) => record.id === value);
  const visits = state.order.flatMap((id) =>
    state.records.filter((record) => record.id === id && record.kind === 'city')
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-h-11" aria-label={label}>
          {visit ? canvasName(state, visit) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        <Button variant="ghost" onClick={() => onChange('')}>
          Unset
        </Button>
        {visits.map((record) => (
          <Button
            key={record.id}
            variant={record.id === value ? 'secondary' : 'ghost'}
            onClick={() => onChange(record.id)}
          >
            {canvasName(state, record)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TransportSchedule({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  const [end, setEnd] = useState(record.schedule?.end);
  const update = (start: string, finish: string | undefined): void => {
    const schedule = isTripDate(start)
      ? { ...record.schedule, start, end: finish && isTripDate(finish) ? finish : undefined }
      : undefined;
    change({
      ...state,
      records: state.records.map((item) => (item.id === record.id ? { ...item, schedule } : item)),
    });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <TextInput
        label="Departure date"
        type="date"
        value={record.schedule?.start ?? ''}
        onInput={(event) =>
          update(event.currentTarget.value, record.schedule ? record.schedule.end : end)
        }
      />
      <TextInput
        label="Arrival date"
        type="date"
        value={record.schedule ? (record.schedule.end ?? '') : (end ?? '')}
        onInput={(event) => {
          const value = event.currentTarget.value;
          const finish = isTripDate(value) ? value : undefined;
          setEnd(finish);
          if (record.schedule) update(record.schedule.start, finish);
        }}
      />
    </div>
  );
}

/** Edit the transport's own name without replacing airport references or purchased facts. */
export function TransportName({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  const title = record.title ?? presentTripRecord(record, state.records).title;
  return (
    <TextInput
      key={title}
      aria-label="Transport name"
      variant="ghost"
      defaultValue={title}
      onBlur={(event) =>
        change({
          ...state,
          records: state.records.map((item) =>
            item.id === record.id ? { ...item, title: event.currentTarget.value } : item
          ),
        })
      }
    />
  );
}

/** Edit route endpoints and floating dates, leaving precise booking clocks to their zone-aware editor. */
export function TransportFields({ record }: { record: TripRecord }) {
  const { state, change } = useCanvas();
  const link = state.transitLinks[record.id] ?? { from: '', to: '' };
  const precise = canvasCalendar(state).some(
    (booking) => booking.recordId === record.id && !booking.allDay
  );
  const update = (field: 'from' | 'to', value: string): void =>
    change({
      ...state,
      transitLinks: { ...state.transitLinks, [record.id]: { ...link, [field]: value } },
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CanvasVisitEndpoint
          value={link.from}
          label="Departure visit"
          onChange={(value) => update('from', value)}
        />
        <span aria-hidden>→</span>
        <CanvasVisitEndpoint
          value={link.to}
          label="Arrival visit"
          onChange={(value) => update('to', value)}
        />
      </div>
      {!precise && <TransportSchedule record={record} />}
    </div>
  );
}
