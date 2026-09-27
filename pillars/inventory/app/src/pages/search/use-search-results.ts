import { useMemo } from 'react';

import { typeFilterOptions, placeFilterOptions } from '../../foundation/list-page/list-filters.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { useRecents } from '../../inventory-web/recents.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { usePurchasesSearch } from '../../inventory-web/usePurchasesSearch.js';
import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { inventoryItemHits, inventoryResultOrder } from './search-model.js';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { SearchUrlState } from './use-search-url.js';

/** The server results and shared inventory sources consumed by the search page. */
export interface SearchResultsState {
  readonly inventory: WebSearchApi;
  readonly purchases: ReturnType<typeof usePurchasesSearch>;
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly world: PlacementWorld;
  readonly recents: ReturnType<typeof useRecents>;
  readonly order: readonly string[];
  readonly itemOrder: readonly string[];
  readonly typeOptions: readonly FilterOption[];
  readonly placementOptions: readonly FilterOption[];
  readonly selection: ReturnType<typeof useSelection>;
  readonly status: 'idle' | 'pending' | 'error' | 'success';
  readonly counts: Readonly<Record<'inventory' | 'purchases', number>>;
}

function searchItems(search: WebSearchApi): ItemRowModel[] {
  return [
    ...(search.results.exact === null ? [] : [search.results.exact]),
    ...inventoryItemHits(search.results).map((hit) => hit.item),
  ];
}

function subjectFor(items: readonly ItemRowModel[], recentIds: readonly string[]): PickerSubject {
  return {
    kind: 'items',
    ids: [...new Set([...items.map((item) => item.id), ...recentIds])],
  };
}

/** Loads both scopes, placement sources, and selection order for one URL state. */
export function useSearchResults(
  url: SearchUrlState,
  debouncedQuery: string,
  debouncedTypeKey: string | null,
  debouncedWithin: string | null
): SearchResultsState {
  const inventory = useWebSearch({
    q: debouncedQuery,
    typeKey: debouncedTypeKey ?? undefined,
    within: debouncedWithin ?? undefined,
    limit: 30,
  });
  const purchases = usePurchasesSearch(debouncedQuery);
  const recents = useRecents();
  const recentItemIds = useMemo(
    () => recents.records.filter((record) => record.kind === 'item').map((record) => record.id),
    [recents.records]
  );
  const items = useMemo(() => searchItems(inventory), [inventory]);
  const subject = useMemo(() => subjectFor(items, recentItemIds), [items, recentItemIds]);
  const placement = usePlacementSources(subject);
  const order = useMemo(
    () =>
      url.scope === 'inventory'
        ? inventoryResultOrder(inventory.results)
        : purchases.hits.map((hit) => hit.id),
    [inventory.results, purchases.hits, url.scope]
  );
  const itemOrder = useMemo(
    () => order.filter((id) => placement.world.items.has(id)),
    [order, placement.world.items]
  );
  const selection = useSelection(itemOrder);
  const typeOptions = typeFilterOptions(placement.catalogue?.types ?? []);
  const placementOptions = placeFilterOptions(placement.locations, [
    ...placement.openContainers,
    ...placement.closedContainers,
  ]);
  const status = url.scope === 'inventory' ? inventory.status : purchases.status;
  const counts = useMemo(
    () => ({ inventory: inventory.results.total, purchases: purchases.hits.length }),
    [inventory.results.total, purchases.hits.length]
  );
  return {
    inventory,
    purchases,
    placement,
    world: placement.world,
    recents,
    order,
    itemOrder,
    typeOptions,
    placementOptions,
    selection,
    status,
    counts,
  };
}
