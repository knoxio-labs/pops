import { AlertTriangle } from 'lucide-react';

import { Badge, Select, cn } from '@pops/ui';

import { Field, Remove } from './controls';
import { cities, cityName, overlap, visits } from './model';

import type { Person, Availability } from './model';
/** Editable bounded availability with deterministic visit overlap. */
export function AvailabilityRow({
  person,
  change,
  entry,
}: {
  person: Person;
  change: (next: Person) => void;
  entry: Availability;
}) {
  const update = (next: typeof entry) =>
    change({
      ...person,
      availability: person.availability.map((item) => (item.id === entry.id ? next : item)),
    });
  const conflict = person.availability.some(
    (other) =>
      other.id !== entry.id &&
      other.status !== entry.status &&
      other.status !== 'Unknown' &&
      entry.status !== 'Unknown' &&
      overlap(entry, other)
  );
  return (
    <div
      key={entry.id}
      className={cn(
        'group space-y-1 rounded-lg border border-dashed border-app-accent p-2',
        conflict && 'border-destructive'
      )}
    >
      <div className="flex items-end gap-2">
        <AvailabilityFields entry={entry} update={update} />
        <Remove
          name="availability"
          onClick={() =>
            change({
              ...person,
              availability: person.availability.filter((item) => item.id !== entry.id),
            })
          }
        />
      </div>
      <AvailabilityFindings entry={entry} conflict={conflict} />
    </div>
  );
}

function AvailabilityFields({
  entry,
  update,
}: {
  entry: Availability;
  update: (next: Availability) => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
      <Select
        aria-label="City"
        variant="ghost"
        value={entry.city}
        options={[
          { value: '', label: 'Choose city' },
          ...cities.map((city) => ({ value: city.id, label: city.name })),
        ]}
        onChange={(event) => update({ ...entry, city: event.target.value })}
      />
      <Select
        aria-label="Availability"
        variant="ghost"
        value={entry.status}
        options={['Available', 'Unavailable', 'Unknown'].map((value) => ({
          value,
          label: value,
        }))}
        onChange={(event) => update({ ...entry, status: event.target.value })}
      />
      <Field
        label="From"
        type="date"
        value={entry.start}
        update={(start) => update({ ...entry, start })}
      />
      <Field
        label="Until"
        type="date"
        value={entry.end}
        update={(end) => update({ ...entry, end })}
      />
    </div>
  );
}

function AvailabilityFindings({ entry, conflict }: { entry: Availability; conflict: boolean }) {
  return (
    <>
      {entry.start && entry.end && entry.start > entry.end && (
        <p role="alert" className="text-sm text-destructive">
          End date precedes start date
        </p>
      )}
      {conflict && (
        <Badge variant="outline" className="border-destructive text-destructive">
          <AlertTriangle className="mr-1 size-4" aria-hidden />
          Conflicting availability
        </Badge>
      )}
      {visits.map((visit) => {
        const dates = overlap(entry, visit);
        return dates ? (
          <p key={visit.id} className="rounded-md bg-accent p-3 text-sm font-medium">
            {entry.status} · {cityName(visit.city)} visit ·{' '}
            {dates
              .split(' → ')
              .map((date) =>
                new Intl.DateTimeFormat('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                }).format(new Date(date))
              )
              .join(' → ')}
          </p>
        ) : null;
      })}
    </>
  );
}
