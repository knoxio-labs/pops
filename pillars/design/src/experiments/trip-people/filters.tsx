import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';

import { Button, Chip, ComboboxSelect, TextInput } from '@pops/ui';

import { useTripPeople } from './context';
import { meetingAgreements, meetingIntentions, MeetingVisit } from './fields';

import type { PeopleFilters } from './model';

/** Discloses useful meeting filters and keeps their active values visible when closed. */
export function TripPeopleFilters({
  filters,
  change,
}: {
  filters: PeopleFilters;
  change: (next: PeopleFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section aria-label="People filters" className="space-y-2">
      <div className="flex items-center gap-2">
        <TextInput
          containerClassName="min-w-0 flex-1"
          aria-label="Search people and plans"
          placeholder="Search people and plans"
          value={filters.query}
          onChange={(event) => change({ ...filters, query: event.currentTarget.value })}
        />
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
        </Button>
      </div>
      {open && (
        <div id={id} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MeetingVisit
            filter
            value={filters.visitId}
            change={(visitId) => change({ ...filters, visitId })}
          />
          <ComboboxSelect
            aria-label="Filter intent"
            value={filters.intention}
            options={[{ value: '', label: 'All intentions' }, ...meetingIntentions]}
            onChange={(intention) => {
              if (typeof intention === 'string') change({ ...filters, intention });
            }}
          />
          <ComboboxSelect
            aria-label="Filter agreement"
            value={filters.agreement}
            options={[{ value: '', label: 'All agreements' }, ...meetingAgreements]}
            onChange={(agreement) => {
              if (typeof agreement === 'string') change({ ...filters, agreement });
            }}
          />
        </div>
      )}
      <ActivePeopleFilters filters={filters} change={change} />
    </section>
  );
}

function ActivePeopleFilters({
  filters,
  change,
}: {
  filters: PeopleFilters;
  change: (next: PeopleFilters) => void;
}) {
  const { state } = useTripPeople();
  return (
    <div className="flex flex-wrap gap-2" aria-label="Active filters">
      {filters.intention && (
        <Chip
          removable
          removeLabel="Clear intent filter"
          onRemove={() => change({ ...filters, intention: '' })}
        >
          {filters.intention}
        </Chip>
      )}
      {filters.agreement && (
        <Chip
          removable
          removeLabel="Clear agreement filter"
          onRemove={() => change({ ...filters, agreement: '' })}
        >
          {filters.agreement}
        </Chip>
      )}
      {filters.visitId && (
        <Chip
          removable
          removeLabel="Clear visit filter"
          onRemove={() => change({ ...filters, visitId: '' })}
        >
          {state.visits.find((visit) => visit.id === filters.visitId)?.name ?? 'Visit unavailable'}
        </Chip>
      )}
    </div>
  );
}
