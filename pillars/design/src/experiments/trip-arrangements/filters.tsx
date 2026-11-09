import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';

import { Button, Chip, ComboboxSelect, TextInput } from '@pops/ui';

import type { ArrangementFilters } from './model';

/** Explicit arrangement source kinds; events do not imply a ticket requirement. */
export const arrangementKindOptions = [
  { value: 'transport', label: 'Transport' },
  { value: 'stay', label: 'Stays' },
  { value: 'event', label: 'Events & tickets' },
  { value: 'rental', label: 'Rental' },
];
const purchaseOptions = [
  { value: 'all', label: 'All purchase states' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'not-purchased', label: 'Not purchased' },
];

/** Discloses projection filters while retaining removable active values when collapsed. */
export function ArrangementFilterBar({
  filters,
  change,
}: {
  filters: ArrangementFilters;
  change: (next: ArrangementFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const controlsId = useId();
  return (
    <section aria-label="Arrangement filters" className="space-y-2">
      <div className="flex items-center gap-2">
        <TextInput
          containerClassName="min-w-0 flex-1"
          aria-label="Search arrangements"
          placeholder="Search arrangements"
          value={filters.query}
          onChange={(event) => change({ ...filters, query: event.currentTarget.value })}
        />
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls={controlsId}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
        </Button>
      </div>
      {open && (
        <div id={controlsId} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ComboboxSelect
            aria-label="Kind"
            value={filters.kind}
            options={[{ value: '', label: 'All kinds' }, ...arrangementKindOptions]}
            onChange={(kind) => {
              if (typeof kind === 'string') change({ ...filters, kind });
            }}
          />
          <ComboboxSelect
            aria-label="Purchase state"
            value={filters.purchase}
            options={purchaseOptions}
            onChange={(purchase) => {
              if (purchase === 'all' || purchase === 'purchased' || purchase === 'not-purchased')
                change({ ...filters, purchase });
            }}
          />
        </div>
      )}
      <ActiveArrangementFilters filters={filters} change={change} />
    </section>
  );
}

function ActiveArrangementFilters({
  filters,
  change,
}: {
  filters: ArrangementFilters;
  change: (next: ArrangementFilters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Active filters">
      {filters.kind && (
        <Chip
          removable
          removeLabel="Clear kind filter"
          onRemove={() => change({ ...filters, kind: '' })}
        >
          {arrangementKindOptions.find((option) => option.value === filters.kind)?.label ??
            filters.kind}
        </Chip>
      )}
      {filters.purchase !== 'all' && (
        <Chip
          removable
          removeLabel="Clear purchase filter"
          onRemove={() => change({ ...filters, purchase: 'all' })}
        >
          {purchaseOptions.find((option) => option.value === filters.purchase)?.label}
        </Chip>
      )}
    </div>
  );
}
