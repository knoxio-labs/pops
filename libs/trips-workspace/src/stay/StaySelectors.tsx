import { Select } from '@pops/ui';

import type { JSX } from 'react';

import type { Stay, StayFieldProps, Visit, Place } from './types';

/** Only explicit approved kind/status values and existing visit identities can be selected. */
export function StaySelectors({
  stay,
  visits,
  places,
  commit,
}: StayFieldProps & { visits: Visit[]; places: Place[] }): JSX.Element {
  return (
    <div className="grid gap-3 @lg:grid-cols-3">
      <Select
        label="Stay kind"
        value={stay.kind ?? ''}
        options={[
          { value: '', label: 'Not selected' },
          ...kinds.map((kind) => ({ value: kind, label: kind })),
        ]}
        onChange={(event) =>
          commit({ kind: kinds.find((kind) => kind === event.target.value) ?? null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
      <Select
        label="Stay status"
        value={stay.status ?? ''}
        options={[
          { value: '', label: 'Not selected' },
          ...statuses.map((status) => ({ value: status, label: status })),
        ]}
        onChange={(event) =>
          commit({ status: statuses.find((status) => status === event.target.value) ?? null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
      <Select
        label="Visit"
        value={stay.visitId === null ? '' : String(stay.visitId)}
        options={visitOptions(stay, visits, places)}
        onChange={(event) =>
          commit({ visitId: event.target.value ? Number(event.target.value) : null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
    </div>
  );
}

const kinds = ['hotel', 'friend', 'family', 'other'] satisfies NonNullable<Stay['kind']>[];
const statuses = ['Considering', 'Agreed', 'Reserved', 'Purchased'] satisfies NonNullable<
  Stay['status']
>[];

function visitOptions(
  stay: Stay,
  visits: Visit[],
  places: Place[]
): { value: string; label: string }[] {
  const options = visits.map((visit) => ({
    value: String(visit.id),
    label: places.find((place) => place.id === visit.placeId)?.name ?? `Visit ${visit.id}`,
  }));
  if (stay.visitId !== null && !visits.some((visit) => visit.id === stay.visitId))
    options.push({ value: String(stay.visitId), label: `Visit ${stay.visitId}` });
  return [{ value: '', label: 'No visit linked' }, ...options];
}
