/**
 * React Query plumbing for the Drafts inbox tab. Polls every 60s so
 * newly-completed ingests appear without a manual refresh;
 * `refetchIntervalInBackground: false` pauses polling when the tab is hidden.
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import { unwrap } from '../../food-api-helpers.js';
import { inboxList } from '../../food-api/index.js';
import { type DraftsFiltersState, toQueryInput } from './drafts-filters.js';

import type { InboxListData } from '../../food-api/types.gen.js';

interface UseDraftsTabOpts {
  filters: DraftsFiltersState;
}

const DRAFTS_POLL_INTERVAL_MS = 60_000;
const DRAFTS_PAGE_SIZE = 20;
const INITIAL_PAGE_PARAM: string | undefined = undefined;

/**
 * Loads draft inbox pages for the current filters and refreshes every loaded
 * page on the existing 60-second polling interval.
 */
export function useDraftsTab({ filters }: UseDraftsTabOpts) {
  const queryInput: Omit<NonNullable<InboxListData['body']>, 'cursor'> = {
    ...toQueryInput(filters),
    limit: DRAFTS_PAGE_SIZE,
  };
  const query = useInfiniteQuery({
    queryKey: ['food', 'inbox', 'list', queryInput],
    queryFn: async ({ pageParam }) =>
      unwrap(await inboxList({ body: { ...queryInput, cursor: pageParam } })),
    initialPageParam: INITIAL_PAGE_PARAM,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: DRAFTS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  return {
    rows: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isError: query.isError,
    error: query.error,
  };
}
