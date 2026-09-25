/**
 * The row above the list: the in-page filter box (it narrows this list; the
 * TopBar box searches everything), the filter popover, the sort when there
 * are no column headers to sort by, and the view toggle.
 */
import { LayoutGrid, Rows3, Search, TableProperties } from 'lucide-react';

import { Select, TextInput, ViewToggleGroup } from '@pops/ui';

import { FilterPopover } from './filter-popover';

import type { ReactNode } from 'react';

import type { ItemsFilters, ItemsSort, ItemsView } from './browse-model';
import type { FilterOption } from './filter-popover';

/** Props for {@link ItemsToolbar}. */
export interface ItemsToolbarProps {
  filters: ItemsFilters;
  view: ItemsView;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  onFilters: (patch: Partial<ItemsFilters>) => void;
  onClear: () => void;
  onView: (view: ItemsView) => void;
  filterOpen?: boolean;
  placeholder?: string;
  scope?: 'items' | 'containers';
  /** Whether the view toggle shows; Containers is a table only. */
  views?: boolean;
  /** Trailing controls: the segmented state filter on Containers. */
  children?: ReactNode;
}

const VIEWS = [
  { value: 'table' as const, label: 'Table', icon: <TableProperties className="size-4" /> },
  { value: 'compact' as const, label: 'Compact table', icon: <Rows3 className="size-4" /> },
  { value: 'cards' as const, label: 'Cards', icon: <LayoutGrid className="size-4" /> },
];

const SORTS: FilterOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently changed' },
  { value: 'type', label: 'Type' },
  { value: 'where', label: 'Where' },
];

function isSort(value: string): value is ItemsSort {
  return SORTS.some((option) => option.value === value);
}

/** The toolbar. */
export function ItemsToolbar(props: ItemsToolbarProps) {
  const { filters, view, onFilters } = props;
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
        defaultOpen={props.filterOpen}
        scope={props.scope}
      />
      {props.children}
      <span className="ml-auto" />
      {view === 'cards' ? (
        <Select
          size="sm"
          aria-label="Sort by"
          value={filters.sort}
          options={SORTS}
          containerClassName="w-44"
          onChange={(event) => {
            if (isSort(event.target.value)) onFilters({ sort: event.target.value });
          }}
        />
      ) : null}
      {props.views === false ? null : (
        <ViewToggleGroup options={VIEWS} value={view} onChange={props.onView} />
      )}
    </div>
  );
}
