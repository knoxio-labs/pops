/**
 * Free-text search over the inventory pillar's `POST /search`, the same
 * federated route the unified-search orchestrator calls, used directly here
 * for in-app search over items.
 */
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { searchSearch } from '../inventory-api/index.js';

import type { SearchSearchData } from '../inventory-api/types.gen.js';

type SearchQuery = NonNullable<SearchSearchData['body']>['query'];
type SearchFilterInput = NonNullable<SearchQuery['filters']>[number];

/** A single structured narrowing of the search, e.g. `{ field: 'room', value: 'Garage' }`. */
export type InventorySearchFilter = Pick<SearchFilterInput, 'field' | 'value'>;

/**
 * Search inventory items by free text, optionally narrowed by structured
 * filters. Disabled while `text` is empty and there are no filters -- an
 * empty query is not "match everything" here, it is "nothing to search".
 */
export function useInventorySearch(text: string, filters: InventorySearchFilter[] = []) {
  const trimmed = text.trim();
  return useQuery({
    queryKey: ['inventory', 'web', 'search', trimmed, filters] as const,
    queryFn: async () =>
      unwrap(
        await searchSearch({
          body: {
            query: {
              text: trimmed,
              filters: filters.map((f) => ({
                field: f.field,
                operator: 'eq' as const,
                value: f.value,
              })),
            },
          },
        })
      ),
    enabled: trimmed.length > 0 || filters.length > 0,
  });
}
