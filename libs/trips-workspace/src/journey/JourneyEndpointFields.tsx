import { Select, TextInput } from '@pops/ui';

import { endpointText } from './model';

import type { JSX } from 'react';

import type { Place } from '../stay/types';
import type { JourneyLeg, LegPatch } from './types';

/** Independent location, local-clock and zone edits replace a complete retained source endpoint. */
export function JourneyEndpointFields({
  leg,
  side,
  places,
  edit,
  save,
}: {
  leg: JourneyLeg;
  side: 'from' | 'to';
  places: Place[];
  edit: (patch: LegPatch) => void;
  save: (patch: LegPatch) => void;
}): JSX.Element {
  const endpoint = leg[side];
  const label = side === 'from' ? 'Departure' : 'Arrival';
  const missingPlace =
    endpoint.placeId !== undefined && !places.some((place) => place.id === endpoint.placeId);
  return (
    <section aria-label={label} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
      <Select
        label={`${label} place`}
        value={endpoint.placeId ?? ''}
        options={[
          { value: '', label: 'No place recorded' },
          ...(missingPlace
            ? [
                {
                  value: String(endpoint.placeId),
                  label: `Place ${endpoint.placeId} · unavailable`,
                },
              ]
            : []),
          ...places.map((place) => ({ value: String(place.id), label: place.name })),
        ]}
        onChange={(event) => {
          const next = { ...endpoint };
          if (event.target.value === '') delete next.placeId;
          else next.placeId = Number(event.target.value);
          save({ [side]: next });
        }}
      />
      {(['sourceLabel', 'local', 'timeZone'] as const).map((field) => (
        <TextInput
          key={field}
          label={`${label} ${endpointLabels[field]}`}
          type="text"
          placeholder={field === 'local' ? '2029-02-01T22:15:00.123' : undefined}
          value={endpoint[field] ?? ''}
          onChange={(event) => edit({ [side]: endpointText(endpoint, field, event.target.value) })}
          onBlur={() => save({ [side]: endpoint })}
        />
      ))}
      {!endpoint.local && <p className="text-sm text-muted-foreground">{label} time unknown</p>}
      {!endpoint.timeZone && (
        <p className="text-sm text-muted-foreground">{label} time zone unknown</p>
      )}
    </section>
  );
}

const endpointLabels = { sourceLabel: 'source label', local: 'local time', timeZone: 'time zone' };
