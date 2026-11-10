import { Select } from '@pops/ui';

import type { JSX } from 'react';

import type { IdeaFieldProps } from './idea-field-types';

/** Select exact recorded place and visit identities without appending to or inferring the route. */

export function IdeaLocationFields({
  session,
  row,
  value,
  busy,
  context,
}: IdeaFieldProps): JSX.Element {
  const places = (context.places.data ?? []).map((place) => ({
    value: String(place.id),
    label: `${place.name} · ${place.id}`,
  }));
  const visits = (context.visits.data ?? []).map((visit) => ({
    value: String(visit.id),
    label: `Visit ${visit.id}`,
  }));
  if (value.placeId !== null && !places.some((place) => place.value === String(value.placeId)))
    places.push({ value: String(value.placeId), label: `Unavailable place ${value.placeId}` });
  if (value.visitId !== null && !visits.some((visit) => visit.value === String(value.visitId)))
    visits.push({ value: String(value.visitId), label: `Unavailable visit ${value.visitId}` });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Select
        label="Idea recorded location"
        value={value.placeId === null ? '' : String(value.placeId)}
        disabled={busy}
        options={[{ value: '', label: 'Unassigned' }, ...places]}
        onChange={(event) => {
          session.records.editIdea(row, {
            placeId: event.target.value === '' ? null : Number(event.target.value),
          });
          void session.records.saveIdea(row.id);
        }}
      />
      <Select
        label="Idea in visit"
        value={value.visitId === null ? '' : String(value.visitId)}
        disabled={busy}
        options={[{ value: '', label: 'No visit' }, ...visits]}
        onChange={(event) => {
          session.records.editIdea(row, {
            visitId: event.target.value === '' ? null : Number(event.target.value),
          });
          void session.records.saveIdea(row.id);
        }}
      />
    </div>
  );
}
