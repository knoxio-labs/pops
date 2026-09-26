import { useInfiniteQuery } from '@tanstack/react-query';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { webEventsList } from '../inventory-api/index.js';

import type {
  WebEventsListData,
  WebEventsListResponse,
  WebEventsListResponses,
} from '../inventory-api/types.gen.js';

/** The cache-key root shared by Activity, Overview recent work, and item history. */
export const WEB_EVENTS_QUERY_KEY = ['inventory', 'web', 'events'] as const;

/** One event returned by the inventory web activity feed. */
export type WebEvent = WebEventsListResponse['events'][number];

/** The server filters accepted by the inventory web activity feed. */
export interface WebEventsFilter {
  /** Event kinds are OR-ed by the server. */
  readonly kinds?: readonly string[];
  readonly actorKind?: 'device' | 'web' | 'service' | 'migration';
  /** One item or location, for item and location history. */
  readonly entityId?: string;
  readonly q?: string;
  /** Page size between 1 and 200; the default is 50. */
  readonly limit?: number;
}

/** The paged activity data and controls exposed to inventory web pages. */
export interface WebEventsFeed {
  readonly events: WebEvent[];
  /** Counts from the first page, including kinds excluded by the page filter. */
  readonly kindCounts: Readonly<Record<string, number>>;
  /** The server total from the first page, or null before it loads. */
  readonly total: number | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
}

const DEFAULT_LIMIT = 50;

function eventQuery(
  filter: WebEventsFilter,
  cursor: string | undefined
): WebEventsListData['query'] {
  const query: WebEventsListData['query'] = {
    limit: filter.limit ?? DEFAULT_LIMIT,
    cursor,
  };
  if (filter.kinds !== undefined && filter.kinds.length > 0) {
    query.kind = filter.kinds.join(',');
  }
  if (filter.actorKind !== undefined) query.actorKind = filter.actorKind;
  if (filter.entityId !== undefined) query.entityId = filter.entityId;
  const q = filter.q?.trim();
  if (q !== undefined && q.length > 0) query.q = q;
  return query;
}

function queryKey(filter: WebEventsFilter): readonly unknown[] {
  return [
    ...WEB_EVENTS_QUERY_KEY,
    {
      kinds: filter.kinds === undefined ? [] : [...filter.kinds],
      actorKind: filter.actorKind,
      entityId: filter.entityId,
      q: filter.q?.trim() ?? '',
      limit: filter.limit ?? DEFAULT_LIMIT,
    },
  ];
}

/** Reads the inventory activity and item-history feed, preserving server event data and order. */
export function useWebEvents(filter: WebEventsFilter): WebEventsFeed {
  const query = useInfiniteQuery<WebEventsListResponses[200], InventoryApiError>({
    queryKey: queryKey(filter),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await webEventsList({
          query: eventQuery(filter, typeof pageParam === 'string' ? pageParam : undefined),
          signal,
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });

  const pages = query.data?.pages ?? [];
  const firstPage = pages[0];
  return {
    events: pages.flatMap((page) => page.events),
    kindCounts: firstPage?.kindCounts ?? {},
    total: firstPage?.total ?? null,
    status: query.status,
    error: query.error instanceof InventoryApiError ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}
