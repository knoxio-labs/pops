import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { recordOpened } from '../../inventory-web/recents.js';
import { stepSearchResult } from './search-model.js';
import { searchItemForId, useSearchOpenResult } from './search-open-result.js';

import type { KeyboardEvent } from 'react';

import type { SearchResultsState } from './use-search-results.js';
import type { SearchParamPatch, SearchUrlState } from './use-search-url.js';

/** Navigation and retry actions used by search result listboxes. */
export interface SearchNavigationActions {
  readonly activate: (id: string) => void;
  readonly openResult: (id: string) => void;
  readonly openActive: () => void;
  readonly onListKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly retry: () => void;
}

/** Wires active-result URL state, keyboard navigation, and detail routes. */
export function useSearchNavigation(
  url: SearchUrlState,
  patchUrl: (patch: SearchParamPatch) => void,
  results: SearchResultsState,
  activeId: string | null
): SearchNavigationActions {
  const queryClient = useQueryClient();
  const openResult = useSearchOpenResult(url.scope, results);
  const activate = useCallback(
    (id: string): void => {
      patchUrl({ selectedId: id });
      const item = searchItemForId(results.inventory, results.world, id);
      if (item !== null) recordOpened({ kind: 'item', id: item.id });
      else if (results.world.locations.has(id)) recordOpened({ kind: 'location', id });
    },
    [patchUrl, results.inventory, results.world]
  );
  const openActive = useCallback((): void => {
    if (activeId !== null) openResult(activeId);
  }, [activeId, openResult]);
  const onListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      const key = event.key.toLowerCase();
      if (key === 'arrowdown' || key === 'j' || key === 'arrowup' || key === 'k') {
        const next = stepSearchResult(
          activeId,
          results.order,
          key === 'arrowup' || key === 'k' ? -1 : 1
        );
        if (next !== null) {
          event.preventDefault();
          activate(next);
        }
        return;
      }
      if (key === 'enter') {
        event.preventDefault();
        openActive();
        return;
      }
      if (results.selection.onKey(event)) event.preventDefault();
    },
    [activeId, activate, openActive, results.order, results.selection]
  );
  const retry = (): void => {
    results.inventory.refetch();
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'purchases', 'search'] });
  };
  return { activate, openResult, openActive, onListKeyDown, retry };
}
