import { Select, TextInput } from '@pops/ui';

import { useCanvas } from '../trip-route-editing/canvas-context';
import { EventTiming } from './event-timing';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Concrete event names and explicit intentions remain directly editable source fields. */
export function EventFields({ event }: { event: TripRecord }) {
  const { state, change } = useCanvas();
  const update = (next: TripRecord) =>
    change({ ...state, records: state.records.map((r) => (r.id === event.id ? next : r)) });
  return (
    <div className="space-y-2">
      <TextInput
        aria-label="Event name"
        variant="ghost"
        key={`${event.id}:${event.title ?? ''}`}
        defaultValue={event.title ?? ''}
        placeholder="Event name"
        containerClassName="bg-transparent px-0"
        className="text-xl font-semibold md:text-xl"
        onBlur={(e) => {
          if (e.currentTarget.value !== event.title)
            update({ ...event, title: e.currentTarget.value });
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <EventTiming event={event} />
        <EventChoices event={event} update={update} />
      </div>
    </div>
  );
}

function EventChoices({
  event,
  update,
}: {
  event: TripRecord;
  update: (next: TripRecord) => void;
}) {
  const { state } = useCanvas();
  return (
    <>
      <div className="w-48">
        <Select
          aria-label="Event city"
          variant="ghost"
          containerClassName="bg-transparent"
          value={event.placeId}
          options={[
            { value: '', label: 'Add city' },
            ...state.places
              .filter((p) => p.kind !== 'airport')
              .map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(e) => update({ ...event, placeId: e.target.value })}
        />
      </div>
      <div className="w-36">
        <Select
          aria-label="Event intention"
          variant="ghost"
          containerClassName="bg-transparent"
          value={event.intention}
          options={[
            { value: 'Considering', label: 'Considering' },
            { value: 'In plan', label: 'In plan' },
            { value: 'Alternative', label: 'Alternative' },
          ]}
          onChange={(e) => {
            const intention = e.target.value;
            if (
              intention === 'Considering' ||
              intention === 'In plan' ||
              intention === 'Alternative'
            )
              update({ ...event, intention });
          }}
        />
      </div>{' '}
    </>
  );
}
