/**
 * A cursor-paged, filtered slice of the live item catalogue
 * (`GET /web/items`, Inventory ADR-002 D1/D2) as an infinite React Query.
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webList } from '../inventory-api/index.js';
import { WEB_ITEMS_QUERY_KEY } from './queryKeys.js';

import type { WebListData } from '../inventory-api/types.gen.js';

/** The filters `GET /web/items` accepts, everything but pagination. */
export type WebItemsFilters = Omit<WebListData['query'], 'cursor' | 'limit'>;

const DEFAULT_LIMIT = 50;

/**
 * Fetch `GET /web/items` a page at a time. `fetchNextPage()` asks for the
 * page after the last one loaded; `hasNextPage` is false once a page comes
 * back with a `null` `nextCursor`. `filters` changing resets pagination, as
 * a query key change always does.
 */
export function useWebItems(filters: WebItemsFilters, limit: number = DEFAULT_LIMIT) {
  return useInfiniteQuery({
    queryKey: [...WEB_ITEMS_QUERY_KEY, 'list', filters, limit] as const,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await webList({
          query: { ...filters, limit, cursor: pageParam },
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
