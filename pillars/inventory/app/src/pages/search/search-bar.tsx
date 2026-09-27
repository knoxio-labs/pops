import { Search } from 'lucide-react';

import { TextInput } from '@pops/ui';

import { ScopeChips } from './scope-chips.js';
import { SearchFilterControls } from './search-filter-controls.js';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { SearchFilters, SearchScope } from './search-model.js';

/** Props for the URL-backed search toolbar. */
export interface SearchBarProps {
  readonly query: string;
  readonly scope: SearchScope;
  readonly counts: Readonly<Record<SearchScope, number>>;
  readonly filters: SearchFilters;
  readonly typeOptions: readonly FilterOption[];
  readonly placementOptions: readonly FilterOption[];
  readonly onQueryChange: (query: string) => void;
  readonly onScopeChange: (scope: SearchScope) => void;
  readonly onFiltersChange: (filters: SearchFilters) => void;
}

/** Renders the search input, scope switcher, and inventory-only filters. */
export function SearchBar({
  query,
  scope,
  counts,
  filters,
  typeOptions,
  placementOptions,
  onQueryChange,
  onScopeChange,
  onFiltersChange,
}: SearchBarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-2 sm:flex-row sm:items-center">
      <TextInput
        aria-label="Search inventory and purchases"
        placeholder={
          scope === 'inventory' ? 'Search items, codes, notes and places' : 'Search purchases'
        }
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onClear={() => onQueryChange('')}
        clearable
        prefix={<Search className="size-4" aria-hidden />}
        className="h-9 min-w-0 flex-1"
        containerClassName="min-w-0 flex-1 bg-background"
      />
      <ScopeChips scope={scope} counts={counts} onScopeChange={onScopeChange} />
      <SearchFilterControls
        scope={scope}
        filters={filters}
        typeOptions={typeOptions}
        placementOptions={placementOptions}
        onFiltersChange={onFiltersChange}
      />
    </div>
  );
}
