import { LayoutGrid, Rows3, Search, TableProperties } from 'lucide-react';

import { Select, TextInput, ViewToggleGroup } from '@pops/ui';

import { FilterPopover } from './filter-popover.js';

import type { ReactElement, ReactNode } from 'react';

import type {
  ItemsSort,
  ItemsUrlFilters,
  ItemsView,
} from '../../inventory-web/items-url-filters.js';
import type { FilterOption } from './list-filters.js';

/** Props for {@link ItemsToolbar}. */
export interface ItemsToolbarProps {
  filters: ItemsUrlFilters;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  onFilters: (patch: Partial<ItemsUrlFilters>) => void;
  onClear: () => void;
  /** When absent, the toolbar omits both the view toggle and the card-only sort select. */
  onView?: (view: ItemsView) => void;
  placeholder?: string;
  scope?: 'items' | 'containers';
  children?: ReactNode;
}

const VIEWS = [
  { value: 'table' as const, label: 'Table', icon: <TableProperties className="size-4" /> },
  { value: 'compact' as const, label: 'Compact table', icon: <Rows3 className="size-4" /> },
  { value: 'cards' as const, label: 'Cards', icon: <LayoutGrid className="size-4" /> },
];

const SORTS: readonly { value: ItemsSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently changed' },
  { value: 'type', label: 'Type' },
  { value: 'where', label: 'Where' },
];

function isItemsSort(value: string): value is ItemsSort {
  return SORTS.some((option) => option.value === value);
}

/** Renders the search, filters, optional sort, and optional view controls. */
export function ItemsToolbar(props: ItemsToolbarProps): ReactElement {
  const { filters, onFilters, onView } = props;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-56 shrink-0 lg:w-64">
        <TextInput
          size="sm"
          value={filters.q}
          onChange={(event) => onFilters({ q: event.target.value })}
          clearable
          onClear={() => onFilters({ q: '' })}
          placeholder={props.placeholder ?? 'Filter by name, code, note or type'}
          aria-label="Filter this list"
          prefix={<Search className="size-4" aria-hidden />}
        />
      </div>
      <FilterPopover
        filters={filters}
        types={props.types}
        places={props.places}
        onChange={onFilters}
        onClear={props.onClear}
        scope={props.scope}
      />
      {props.children}
      {onView !== undefined && filters.view === 'cards' ? (
        <Select
          size="sm"
          aria-label="Sort by"
          value={filters.sort}
          options={[...SORTS]}
          containerClassName="w-44"
          onChange={(event) => {
            if (isItemsSort(event.target.value)) onFilters({ sort: event.target.value });
          }}
        />
      ) : null}
      {onView !== undefined ? (
        <ViewToggleGroup options={VIEWS} value={filters.view} onChange={onView} />
      ) : null}
    </div>
  );
}
