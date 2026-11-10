import { Select, Textarea, TextInput } from '@pops/ui';

import { EventStates } from './EventStates';
import { changeEventTiming } from './model';

import type { JSX } from 'react';

import type { Place, Visit } from '../stay/types';
import type { EventFieldProps, TripEvent } from './types';

/** Direct event facts retain independent intention, arrangement and purchase values. */
export function EventFields(
  props: EventFieldProps & { visits: Visit[]; places: Place[] }
): JSX.Element {
  const { event, edit, commit, visits, places } = props;
  const visitOptions = visits.map((visit) => ({
    value: String(visit.id),
    label: `${places.find((place) => place.id === visit.placeId)?.name ?? 'Visit'} · ${visit.id}`,
  }));
  if (event.visitId !== null && !visits.some((visit) => visit.id === event.visitId))
    visitOptions.push({
      value: String(event.visitId),
      label: `Visit ${event.visitId} unavailable`,
    });
  return (
    <div className="space-y-4">
      <TextInput
        label="Event name"
        value={event.name ?? ''}
        onChange={(e) => edit({ name: e.target.value || null })}
        onBlur={(e) => commit({ name: e.currentTarget.value || null })}
        className="min-h-11"
      />
      <Select
        label="Associated visit"
        value={event.visitId === null ? '' : String(event.visitId)}
        options={[{ value: '', label: 'No visit linked' }, ...visitOptions]}
        onChange={(e) => commit({ visitId: e.target.value ? Number(e.target.value) : null })}
        className="min-h-11"
      />
      <EventStates {...props} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TimingField {...props} field="start" label="Start date" type="date" />
        <TimingField {...props} field="startTime" label="Start time" type="time" />
        <TimingField {...props} field="end" label="End date" type="date" />
        <TimingField {...props} field="endTime" label="End time" type="time" />
      </div>
      <TimingField {...props} field="timeZone" label="Time zone" type="text" />
      {scalarFields.map(({ field, label, type }) => (
        <TextInput
          key={field}
          label={label}
          type={type}
          value={event[field] ?? ''}
          onChange={(e) => edit({ [field]: e.target.value || null })}
          onBlur={(e) => commit({ [field]: e.currentTarget.value || null })}
          className="min-h-11"
        />
      ))}
      <label className="block space-y-2 text-sm">
        Event notes
        <Textarea
          value={event.notes}
          onChange={(e) => edit({ notes: e.target.value })}
          onBlur={(e) => commit({ notes: e.currentTarget.value })}
        />
      </label>
    </div>
  );
}

const scalarFields = [
  { field: 'address', label: 'Address', type: 'text' },
  { field: 'reference', label: 'Booking reference', type: 'text' },
  { field: 'sourceUrl', label: 'Source URL', type: 'url' },
  { field: 'ticketUrl', label: 'Ticket URL', type: 'url' },
] as const;
function TimingField({
  event,
  edit,
  commit,
  field,
  label,
  type,
}: EventFieldProps & {
  field: keyof TripEvent['timing'];
  label: string;
  type: 'date' | 'time' | 'text';
}): JSX.Element {
  return (
    <TextInput
      label={label}
      type={type}
      value={event.timing[field] ?? ''}
      className="min-h-11"
      onChange={(e) => edit({ timing: changeEventTiming(event.timing, field, e.target.value) })}
      onBlur={(e) =>
        commit({ timing: changeEventTiming(event.timing, field, e.currentTarget.value) })
      }
    />
  );
}
