import { useCallback, useEffect, useRef } from 'react';

import { recordQuery } from '../../inventory-web/recents.js';
import { useSearchActions } from './use-search-actions.js';
import { useSearchResults } from './use-search-results.js';
import { useSearchUrlState } from './use-search-url.js';

import type { SearchFilters, SearchScope } from './search-model.js';
import type { SearchActionsState } from './use-search-actions.js';
import type { SearchResultsState } from './use-search-results.js';

/** The complete URL-driven state and actions for the inventory search page. */
export interface SearchPageState
  extends Omit<SearchResultsState, 'status' | 'counts'>, SearchActionsState {
  readonly query: string;
  readonly debouncedQuery: string;
  readonly scope: SearchScope;
  readonly typeKey: string | null;
  readonly within: string | null;
  readonly selectedId: string | null;
  readonly activeId: string | null;
  readonly status: SearchResultsState['status'];
  readonly isDebouncing: boolean;
  readonly counts: SearchResultsState['counts'];
  readonly setQuery: (query: string) => void;
  readonly setScope: (scope: SearchScope) => void;
  readonly setFilters: (filters: SearchFilters) => void;
  readonly clearSelected: () => void;
}

function useArrivalSelection(
  arrivalCode: string,
  exactId: string | null,
  status: SearchResultsState['status'],
  patchUrl: (patch: { selectedId: string }) => void
): void {
  const selected = useRef(false);
  useEffect(() => {
    if (selected.current || arrivalCode === '' || status !== 'success' || exactId === null) return;
    selected.current = true;
    patchUrl({ selectedId: exactId });
  }, [arrivalCode, exactId, patchUrl, status]);
}

function useRecentQuery(query: string, status: SearchResultsState['status']): void {
  useEffect(() => {
    if (query.trim() !== '' && status === 'success') {
      recordQuery(query);
    }
  }, [query, status]);
}

/** Binds URL state, debounced server results, previews, and inventory actions. */
export function useSearchPage(): SearchPageState {
  const urlState = useSearchUrlState();
  const results = useSearchResults(
    urlState.url,
    urlState.debouncedQuery,
    urlState.debouncedFilters.typeKey,
    urlState.debouncedFilters.within
  );
  const { patchUrl } = urlState;
  const activeId = results.order.includes(urlState.url.selectedId ?? '')
    ? urlState.url.selectedId
    : (results.order[0] ?? null);
  const actions = useSearchActions(urlState.url, urlState.patchUrl, results, activeId);
  useArrivalSelection(
    urlState.arrivalCode,
    results.inventory.results.exact?.id ?? null,
    results.inventory.status,
    patchUrl
  );
  useRecentQuery(urlState.debouncedQuery, results.status);
  const setQuery = useCallback(
    (query: string): void => patchUrl({ query, selectedId: null }),
    [patchUrl]
  );
  const setScope = useCallback(
    (scope: SearchScope): void => patchUrl({ scope, selectedId: null }),
    [patchUrl]
  );
  const setFilters = useCallback(
    (filters: SearchFilters): void => patchUrl({ ...filters, selectedId: null }),
    [patchUrl]
  );
  const clearSelected = useCallback((): void => patchUrl({ selectedId: null }), [patchUrl]);
  return {
    ...results,
    ...actions,
    query: urlState.url.query,
    debouncedQuery: urlState.debouncedQuery,
    scope: urlState.url.scope,
    typeKey: urlState.url.typeKey,
    within: urlState.url.within,
    selectedId: urlState.url.selectedId,
    activeId,
    isDebouncing: urlState.isDebouncing,
    setQuery,
    setScope,
    setFilters,
    clearSelected,
  };
}
