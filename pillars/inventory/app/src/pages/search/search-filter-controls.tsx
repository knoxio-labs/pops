import { SlidersHorizontal } from 'lucide-react';

import { Select } from '@pops/ui';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { SearchFilters, SearchScope } from './search-model.js';

/** Props for the inventory-only type and placement filters. */
export interface SearchFilterControlsProps {
  readonly scope: SearchScope;
  readonly filters: SearchFilters;
  readonly typeOptions: readonly FilterOption[];
  readonly placementOptions: readonly FilterOption[];
  readonly onFiltersChange: (filters: SearchFilters) => void;
}

/** Renders type and placement selects, disabled outside the inventory scope. */
export function SearchFilterControls({
  scope,
  filters,
  typeOptions,
  placementOptions,
  onFiltersChange,
}: SearchFilterControlsProps) {
  const disabled = scope === 'purchases';
  return (
    <div className="flex shrink-0 items-center gap-2">
      <SlidersHorizontal className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
      <Select
        aria-label="Filter by type"
        value={filters.typeKey ?? ''}
        onChange={(event) => onFiltersChange({ ...filters, typeKey: event.target.value || null })}
        options={[...typeOptions]}
        placeholder="Type"
        disabled={disabled}
        className="h-9 w-28 text-base md:text-xs"
        containerClassName="bg-background"
      />
      <Select
        aria-label="Filter by placement"
        value={filters.within ?? ''}
        onChange={(event) => onFiltersChange({ ...filters, within: event.target.value || null })}
        options={[...placementOptions]}
        placeholder="Placement"
        disabled={disabled}
        className="h-9 w-32 text-base md:text-xs"
        containerClassName="bg-background"
      />
    </div>
  );
}
