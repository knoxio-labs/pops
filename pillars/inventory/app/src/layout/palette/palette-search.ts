import { useEffect, useMemo, useState } from 'react';

import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { itemRecordCommand, locationRecordCommand } from './palette-commands.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { InventoryPaletteCommand, PaletteScope } from './palette-groups.js';

/** The delay before a palette query is sent to the inventory server. */
export const PALETTE_SEARCH_DEBOUNCE_MS = 200;

/** The state shown by the palette while its server-backed records settle. */
export type PaletteSearchStatus = 'ready' | 'pending' | { error: string };

/** The result data needed by the palette source. */
export interface PaletteSearchState {
  readonly debouncedQuery: string;
  readonly records: readonly InventoryPaletteCommand[];
  readonly status: PaletteSearchStatus;
}

/** Debounces one value and cancels the previous timer when it changes. */
export function useDebouncedPaletteValue<T>(value: T, delay = PALETTE_SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function searchErrorMessage(error: InventoryApiError | null): string {
  return error?.message ?? 'Inventory search could not load.';
}

/** Derives the visible state for one debounced inventory search. */
export function paletteSearchStatus(
  query: string,
  debouncedQuery: string,
  scope: PaletteScope,
  search: Pick<WebSearchApi, 'status' | 'error'>
): PaletteSearchStatus {
  if (query.trim() !== debouncedQuery.trim()) return 'pending';
  if (scope === 'purchases') {
    return query.trim() === ''
      ? 'ready'
      : { error: 'Purchases search is not available in the current inventory contract.' };
  }
  if (query.trim() === '') return 'ready';
  if (search.status === 'pending') return 'pending';
  if (search.status === 'error') return { error: searchErrorMessage(search.error) };
  return 'ready';
}

function searchRecords(search: WebSearchApi, world: PlacementWorld): InventoryPaletteCommand[] {
  const seen = new Set<string>();
  const records: InventoryPaletteCommand[] = [];
  const add = (record: InventoryPaletteCommand): void => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    records.push(record);
  };

  if (search.results.exact !== null) add(itemRecordCommand(search.results.exact, world));
  for (const hit of search.results.items) add(itemRecordCommand(hit.item, world));
  for (const hit of search.results.places) {
    add(locationRecordCommand(hit.place, world));
  }
  return records;
}

/** Maps a settled web-search response into palette records. */
export function inventoryPaletteSearchRecords(
  search: WebSearchApi,
  world: PlacementWorld
): InventoryPaletteCommand[] {
  return searchRecords(search, world);
}

/** Binds the current palette query and scope to the available web-search contract. */
export function usePaletteSearch(
  query: string,
  scope: PaletteScope,
  world: PlacementWorld
): PaletteSearchState {
  const debouncedQuery = useDebouncedPaletteValue(query);
  const search = useWebSearch({
    q: scope === 'inventory' ? debouncedQuery.trim() : '',
    limit: 20,
  });
  const status = paletteSearchStatus(query, debouncedQuery, scope, search);
  const records = useMemo(
    () =>
      scope === 'inventory' && status === 'ready' && query.trim() !== ''
        ? searchRecords(search, world)
        : [],
    [query, scope, search, status, world]
  );

  return { debouncedQuery, records, status };
}
