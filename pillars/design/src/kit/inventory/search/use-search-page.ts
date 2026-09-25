/**
 * The search page's state: query, scope, filters, the active row and the
 * selection over item results. What the page derives (results per scope,
 * counts, the key order) is computed here so the page only draws.
 */
import { useMemo, useState } from 'react';

import { EMPTY_SELECTION, useSelection } from '../foundation';
import { searchPurchases } from './purchase-model';
import {
  NO_SEARCH_FILTERS,
  resultCount,
  resultOrder,
  searchInventory,
  stepActive,
} from './search-model';

import type { PlacementWorld, SelectionApi } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { SearchScope } from './search-bar';
import type { InventoryResults, SearchFilters } from './search-model';

/** Where a design state opens the page. */
export interface SearchSeed {
  query?: string;
  scope?: SearchScope;
  filters?: Partial<SearchFilters>;
  activeId?: string;
  selected?: readonly string[];
}

/** What {@link useSearchPage} hands the page. */
export interface SearchPageState {
  query: string;
  scope: SearchScope;
  filters: SearchFilters;
  results: InventoryResults;
  purchases: PurchaseResult[];
  counts: Readonly<Record<SearchScope, number>>;
  activeId: string | null;
  selection: SelectionApi;
  setQuery: (query: string) => void;
  setScope: (scope: SearchScope) => void;
  setFilters: (patch: Partial<SearchFilters>) => void;
  /** Arrow keys and j/k move the active row; x and Shift-x select items. */
  onKey: (event: {
    key: string;
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
  }) => boolean;
}

const STEPS: Readonly<Record<string, number>> = { arrowdown: 1, j: 1, arrowup: -1, k: -1 };

/** The search page over one world and one set of purchases. */
export function useSearchPage(
  world: PlacementWorld,
  allPurchases: readonly PurchaseResult[],
  seed: SearchSeed = {}
): SearchPageState {
  const [query, setQuery] = useState(seed.query ?? '');
  const [scope, setScope] = useState<SearchScope>(seed.scope ?? 'inventory');
  const [filters, setAll] = useState<SearchFilters>({ ...NO_SEARCH_FILTERS, ...seed.filters });
  const results = useMemo(() => searchInventory(world, query, filters), [world, query, filters]);
  const purchases = useMemo(() => searchPurchases(allPurchases, query), [allPurchases, query]);
  const order = useMemo(() => resultOrder(results), [results]);
  const itemOrder = useMemo(() => order.filter((id) => world.items.has(id)), [order, world]);
  const selection = useSelection(itemOrder, {
    ...EMPTY_SELECTION,
    selected: new Set(seed.selected ?? []),
    anchorId: seed.selected?.at(-1) ?? null,
  });
  const keyOrder = scope === 'purchases' ? purchases.map((purchase) => purchase.id) : order;
  const [picked, setPicked] = useState<string | null>(seed.activeId ?? null);
  const activeId = picked !== null && keyOrder.includes(picked) ? picked : (keyOrder[0] ?? null);
  const onKey: SearchPageState['onKey'] = (event) => {
    const step = STEPS[event.key.toLowerCase()];
    if (step !== undefined && event.metaKey !== true && event.ctrlKey !== true) {
      setPicked(stepActive(keyOrder, activeId, step));
      return true;
    }
    if (event.key.toLowerCase() === 'x' && activeId !== null && world.items.has(activeId)) {
      selection.onRowToggle(activeId, event.shiftKey === true);
      return true;
    }
    return selection.onKey(event);
  };
  return {
    query,
    scope,
    filters,
    results,
    purchases,
    counts: { inventory: resultCount(results), purchases: purchases.length },
    activeId,
    selection,
    setQuery,
    setScope,
    setFilters: (patch) => setAll((current) => ({ ...current, ...patch })),
    onKey,
  };
}
