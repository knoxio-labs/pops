import { Select } from '@pops/ui';

import { ReferenceDetails } from './ContactReference';
import { visitTitle } from './source-labels';

import type { JSX } from 'react';

import type { RentalContext, RentalSourceContext } from './rental-context';

/** Select only an actual ordered Visit identity; retain and independently clear an unresolved stored reference. */
export function RentalVisit({
  label,
  value,
  sources,
  identity,
  onChange,
}: {
  label: string;
  value: number | null;
  sources: RentalSourceContext;
  identity: RentalContext;
  onChange: (id: number | null) => void;
}): JSX.Element {
  const visits = sources.visits?.filter((visit) => visit.tripId === identity.tripId) ?? [];
  const choices = visits.map((visit) => ({
    value: String(visit.id),
    label: visitTitle(visit, { ...sources, visits }, identity.labels),
  }));
  if (value !== null && !visits.some((visit) => visit.id === value))
    choices.push({ value: String(value), label: identity.labels.visitUnavailable });
  return (
    <>
      <Select
        label={label}
        className="min-h-11"
        value={value === null ? '' : String(value)}
        options={[{ value: '', label: identity.labels.unset }, ...choices]}
        onChange={(event) => {
          const selected = event.target.value;
          if (!selected) onChange(null);
          else {
            const visit = visits.find((candidate) => String(candidate.id) === selected);
            if (visit) onChange(visit.id);
          }
        }}
      />
      {value !== null && !visits.some((visit) => visit.id === value) && (
        <ReferenceDetails identity={identity} value={value} />
      )}
    </>
  );
}
