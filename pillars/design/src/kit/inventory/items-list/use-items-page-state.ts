import { useCallback, useState } from 'react';

import { filterInventoryItems, hasAnyActiveFilter } from './filter-items';
import { PARAM_TO_FILTER_KEY } from './items-page-types';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';
import type { KeyboardEvent } from 'react';

import type { ItemsFilterState } from './filter-items';
import type { ItemsPageUiSeed } from './items-page-types';
import type { ViewMode } from './view-mode';

function useItemsFiltersState(seed: ItemsFilterState) {
  const [filters, setFilters] = useState<ItemsFilterState>(seed);

  const onParamChange = useCallback((key: string, value: string) => {
    const filterKey = PARAM_TO_FILTER_KEY[key as keyof typeof PARAM_TO_FILTER_KEY];
    if (!filterKey) return;
    setFilters((prev) => ({ ...prev, [filterKey]: value }));
  }, []);

  const onClearFilters = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      typeFilter: '',
      conditionFilter: '',
      inUseFilter: '',
      locationFilter: '',
    }));
  }, []);

  return { filters, onParamChange, onClearFilters };
}

/**
 * Search, type/condition/in-use/location filters and the table/grid toggle
 * behind `ItemsPage`, plus the derived totals and the asset-id Enter lookup.
 * The app drives filters through `useSearchParams`, which does not survive
 * the port (the canvas is an iframe, so a real `navigate` would leave the
 * surface): filter state lives in local `useState` instead, applied to the
 * fixture items with the same predicates the API uses.
 */
export function useItemsPageState(
  items: InventoryFixtureItem[],
  filtersSeed: ItemsFilterState,
  uiSeed: ItemsPageUiSeed
) {
  const { filters, onParamChange, onClearFilters } = useItemsFiltersState(filtersSeed);
  const [viewMode, setViewMode] = useState<ViewMode>(uiSeed.viewMode);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(uiSeed.deletingItemId);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, onMatch: (id: string) => void) => {
      if (e.key !== 'Enter' || !filters.search.trim()) return;
      const term = filters.search.trim().toLowerCase();
      const match = items.find((item) => item.assetId?.toLowerCase() === term);
      if (match) onMatch(match.id);
    },
    [filters.search, items]
  );

  const hasActiveFilters = hasAnyActiveFilter(filters);
  const hasSearchOrFilters = !!filters.search || hasActiveFilters;
  const filteredItems = filterInventoryItems(items, filters);
  const totalReplacementValue = filteredItems.reduce(
    (total, item) => total + (item.replacementValue ?? 0),
    0
  );
  const totalResaleValue = filteredItems.reduce(
    (total, item) => total + (item.resaleValue ?? 0),
    0
  );

  return {
    filters,
    onParamChange,
    onClearFilters,
    handleSearchKeyDown,
    viewMode,
    setViewMode,
    deletingItemId,
    setDeletingItemId,
    hasActiveFilters,
    hasSearchOrFilters,
    filteredItems,
    totalReplacementValue,
    totalResaleValue,
  };
}
