/**
 * An item and one page of its history (`GET /web/items/:id`, Inventory
 * ADR-002 D1/D2).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webGet } from '../inventory-api/index.js';
import { webItemDetailQueryKey } from './queryKeys.js';

const DEFAULT_HISTORY_LIMIT = 50;

/**
 * The item and its first page of history. `enabled: false` while `id` is
 * absent, so a detail route rendered before its param resolves does not
 * fire a request for `undefined`.
 */
export function useWebItemDetail(id: string | undefined, historyLimit = DEFAULT_HISTORY_LIMIT) {
  return useQuery({
    queryKey: webItemDetailQueryKey(id ?? ''),
    queryFn: async () => unwrap(await webGet({ path: { id: id ?? '' }, query: { historyLimit } })),
    enabled: id !== undefined && id.length > 0,
  });
}

/**
 * An item's full history, one page at a time. Every page re-fetches the item
 * itself alongside the requested history page -- `GET /web/items/:id` does
 * not offer history on its own -- so callers wanting only the growing
 * history list should read `.data.pages[n].history` and ignore `.item` on
 * every page but the first.
 */
export function useWebItemHistory(id: string | undefined, historyLimit = DEFAULT_HISTORY_LIMIT) {
  return useInfiniteQuery({
    queryKey: [...webItemDetailQueryKey(id ?? ''), 'history', historyLimit] as const,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await webGet({
          path: { id: id ?? '' },
          query: { historyLimit, historyCursor: pageParam },
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.history.nextCursor ?? undefined,
    enabled: id !== undefined && id.length > 0,
  });
}
