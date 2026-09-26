import type { WebSearchApi } from './useWebSearch';

type SearchStatus = 'pending' | 'error' | 'success';

/** Combines the search and location request states into the hook state. */
export function searchStatus(
  q: string,
  searchStatusValue: SearchStatus,
  locationStatus: SearchStatus
): WebSearchApi['status'] {
  if (q.length === 0) return 'idle';
  if (searchStatusValue === 'error' || locationStatus === 'error') return 'error';
  if (searchStatusValue === 'pending' || locationStatus === 'pending') return 'pending';
  return 'success';
}

interface SearchActionsSource {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

/** Exposes the imperative controls from the underlying infinite query. */
export function searchActions(
  search: SearchActionsSource
): Pick<WebSearchApi, 'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage' | 'refetch'> {
  return {
    hasNextPage: search.hasNextPage,
    isFetchingNextPage: search.isFetchingNextPage,
    fetchNextPage: () => {
      void search.fetchNextPage();
    },
    refetch: () => {
      void search.refetch();
    },
  };
}
