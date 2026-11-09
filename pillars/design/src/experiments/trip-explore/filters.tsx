import { TextInput } from '@pops/ui';

import { ExploreCity, ExploreKind } from './fields';

import type { ExploreFilters } from './model';

/** Applies the same explicit text, kind and city filters to both grouping proposals. */
export function ExploreFilterBar({
  filters,
  change,
}: {
  filters: ExploreFilters;
  change: (next: ExploreFilters) => void;
}) {
  return (
    <section aria-label="Collection filters" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TextInput
        containerClassName="col-span-2 min-w-0"
        aria-label="Search possibilities"
        placeholder="Search possibilities"
        value={filters.query}
        onChange={(event) => change({ ...filters, query: event.currentTarget.value })}
      />
      <ExploreKind all value={filters.kind} change={(kind) => change({ ...filters, kind })} />
      <ExploreCity
        filter
        value={filters.cityId}
        change={(cityId) => change({ ...filters, cityId })}
      />
    </section>
  );
}
