import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import type { InboxFilters } from './model';

const statuses = [
  { value: 'all', label: 'All items' },
  { value: 'unorganised', label: 'To organise' },
  { value: 'organised', label: 'Organised' },
];

/** Search actual source data and disclose the valid-association status filter. */
export function InboxFiltersControl({
  filters,
  change,
}: {
  filters: InboxFilters;
  change: (next: InboxFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <TextInput
          aria-label="Search inbox"
          placeholder="Search inbox"
          value={filters.query}
          onChange={(event) => change({ ...filters, query: event.currentTarget.value })}
        />
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <SlidersHorizontal className="size-4" />
          Filters
        </Button>
      </div>
      {open && (
        <ComboboxSelect
          aria-label="Organisation"
          value={filters.organisation}
          options={statuses}
          onChange={(value) => {
            if (value === 'all' || value === 'organised' || value === 'unorganised')
              change({ ...filters, organisation: value });
          }}
        />
      )}
      {filters.organisation !== 'all' && (
        <Button
          variant="secondary"
          aria-label="Clear organisation filter"
          onClick={() => change({ ...filters, organisation: 'all' })}
        >
          {statuses.find((status) => status.value === filters.organisation)?.label}
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
