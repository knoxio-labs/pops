import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';

import { Button, Chip, TextInput } from '@pops/ui';

import { useExplore } from './context';
import { ExploreCity, ExploreKind, exploreKindOptions } from './fields';

import type { ExploreFilters } from './model';

/** Applies the same explicit text, kind and city filters to both grouping proposals. */
export function ExploreFilterBar({
  filters,
  change,
}: {
  filters: ExploreFilters;
  change: (next: ExploreFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const controlsId = useId();
  return (
    <section aria-label="Collection filters" className="space-y-2">
      <div className="flex items-center gap-2">
        <TextInput
          containerClassName="min-w-0 flex-1"
          aria-label="Search possibilities"
          placeholder="Search possibilities"
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
          <ExploreKind all value={filters.kind} change={(kind) => change({ ...filters, kind })} />
          <ExploreCity
            filter
            value={filters.cityId}
            change={(cityId) => change({ ...filters, cityId })}
          />
        </div>
      )}
      <ActiveFilters filters={filters} change={change} />
    </section>
  );
}

function ActiveFilters({
  filters,
  change,
}: {
  filters: ExploreFilters;
  change: (next: ExploreFilters) => void;
}) {
  const { state } = useExplore();
  return (
    <>
      {(filters.kind || filters.cityId) && (
        <div className="flex flex-wrap gap-2" aria-label="Active filters">
          {filters.kind && (
            <Chip
              removable
              removeLabel="Clear kind filter"
              onRemove={() => change({ ...filters, kind: '' })}
            >
              {exploreKindOptions.find((kind) => kind.value === filters.kind)?.label ??
                filters.kind}
            </Chip>
          )}
          {filters.cityId && (
            <Chip
              removable
              removeLabel="Clear location filter"
              onRemove={() => change({ ...filters, cityId: '' })}
            >
              {state.cities.find((place) => place.id === filters.cityId)?.name ??
                'Location unavailable'}
            </Chip>
          )}
        </div>
      )}
    </>
  );
}
