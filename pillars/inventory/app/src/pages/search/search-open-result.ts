import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { recordOpened } from '../../inventory-web/recents.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { SearchScope } from './search-model.js';
import type { SearchResultsState } from './use-search-results.js';

/** Finds an item in placement data or the current inventory search response. */
export function searchItemForId(
  search: WebSearchApi,
  world: PlacementWorld,
  id: string
): ItemRowModel | null {
  const fromWorld = world.items.get(id);
  if (fromWorld !== undefined) return fromWorld;
  if (search.results.exact?.id === id) return search.results.exact;
  return search.results.items.find((hit) => hit.item.id === id)?.item ?? null;
}

/** Returns the detail-route action for an active inventory or purchase result. */
export function useSearchOpenResult(
  scope: SearchScope,
  results: SearchResultsState
): (id: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (id: string): void => {
      if (scope === 'purchases') {
        void navigate(`/purchases/${encodeURIComponent(id)}`);
        return;
      }
      const item = searchItemForId(results.inventory, results.world, id);
      if (item !== null) {
        recordOpened({ kind: 'item', id: item.id });
        void navigate(`/inventory/items/${encodeURIComponent(item.id)}`);
        return;
      }
      const location = results.world.locations.get(id);
      if (location !== undefined) {
        recordOpened({ kind: 'location', id: location.id });
        void navigate(`/inventory/locations/${encodeURIComponent(location.id)}`);
      }
    },
    [navigate, results.inventory, results.world, scope]
  );
}
