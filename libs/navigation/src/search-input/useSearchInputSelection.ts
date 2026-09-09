import { type RefObject, useCallback } from 'react';

import { searchOptionId, useSearchKeyboardNav } from '../search-keyboard-nav';
import { useSearchStore } from '../searchStore';

import type { SearchResultHit } from '../SearchResultsPanel';
import type { SearchHitData } from '../uri-resolver';

interface UseSearchInputSelectionArgs {
  containerRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  isRecentView: boolean;
  queries: string[];
  orderedHits: SearchResultHit[];
  onSelectHit: (uri: string, data: SearchHitData) => void;
  onClose: () => void;
}

interface UseSearchInputSelectionResult {
  selectedIndex: number;
  activeDescendantId: string | undefined;
  selectRecentQuery: (query: string) => void;
}

/**
 * Wires `useSearchKeyboardNav` to whichever sub-view is showing (recent
 * searches when the query is empty, result hits otherwise), so the same
 * arrow-key/Enter/Escape mechanism and the same flat index space drive both,
 * and derives the `aria-activedescendant` id from the result.
 */
export function useSearchInputSelection({
  containerRef,
  inputRef,
  isRecentView,
  queries,
  orderedHits,
  onSelectHit,
  onClose,
}: UseSearchInputSelectionArgs): UseSearchInputSelectionResult {
  const setQuery = useSearchStore((s) => s.setQuery);

  const selectRecentQuery = useCallback(
    (recentQuery: string) => {
      if (inputRef.current) inputRef.current.value = recentQuery;
      setQuery(recentQuery);
    },
    [inputRef, setQuery]
  );

  const itemCount = isRecentView ? queries.length : orderedHits.length;

  const { selectedIndex } = useSearchKeyboardNav({
    containerRef,
    resultCount: itemCount,
    onSelect: (index) => {
      if (isRecentView) {
        const recentQuery = queries[index];
        if (recentQuery !== undefined) selectRecentQuery(recentQuery);
        return;
      }
      const hit = orderedHits[index];
      if (hit !== undefined) onSelectHit(hit.uri, hit.data);
    },
    onClose,
  });

  return {
    selectedIndex,
    activeDescendantId: selectedIndex >= 0 ? searchOptionId(selectedIndex) : undefined,
    selectRecentQuery,
  };
}
