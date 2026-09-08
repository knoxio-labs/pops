import { type RefObject, useEffect, useRef } from 'react';

import { useRecentSearches } from '../recent-searches';
import { useSearchInputData } from '../search-input/useSearchInputData';
import { useSearchInputHandlers } from '../search-input/useSearchInputHandlers';
import { useSearchKeyboardNav } from '../search-keyboard-nav';
import { useSearchStore } from '../searchStore';
import { useFocusTrap } from '../useFocusTrap';
import { useMobileSearchHandlers } from './useMobileSearchHandlers';

import type { SearchResultSection } from '../SearchResultsPanel';
import type { SearchHitData } from '../uri-resolver';

/**
 * id of the listbox `MobileSearchOverlay` currently owns (results or recent
 * searches — only one renders at a time), referenced by the input's
 * `aria-controls`/`aria-activedescendant` and by each option's own id.
 */
export const MOBILE_SEARCH_LISTBOX_ID = 'mobile-search-listbox';

interface UseMobileSearchOverlayArgs {
  open: boolean;
  onClose: () => void;
}

interface UseMobileSearchOverlayResult {
  inputRef: RefObject<HTMLInputElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  query: string;
  queries: string[];
  sections: SearchResultSection[];
  showPanel: boolean;
  selectedIndex: number;
  activeDescendantId: string | undefined;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClear: () => void;
  handleCloseOverlay: () => void;
  handleSelectResult: (uri: string, data: SearchHitData) => void;
  handleShowMore: (domain: string) => Promise<void> | void;
  selectRecentQuery: (recentQuery: string) => void;
  clearAllRecent: () => void;
}

function useAutoFocusOnOpen(open: boolean, inputRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, inputRef]);
}

/**
 * Wires `MobileSearchOverlay` to the same data/selection primitives
 * `SearchInput` uses (`useSearchInputData`, `useSearchInputHandlers`,
 * `useSearchKeyboardNav`), so a query behaves identically on both surfaces.
 *
 * Escape closes the whole overlay in one step, not just the results panel
 * beneath it — unlike desktop, the overlay IS the entire search surface on
 * mobile (there's no bare-input state to collapse back to), so a two-stage
 * Escape would have nothing distinct to do on its first press. See
 * `useMobileSearchHandlers` for the close/select wiring itself.
 */
export function useMobileSearchOverlay({
  open,
  onClose,
}: UseMobileSearchOverlayArgs): UseMobileSearchOverlayResult {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = useSearchStore((s) => s.query);
  const isOpen = useSearchStore((s) => s.isOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);
  const { queries, clearAll } = useRecentSearches();

  const { sections, orderedHits, handleShowMore } = useSearchInputData({ query, isOpen });
  const { handleResultClick, handleClose, handleChange, handleClear } = useSearchInputHandlers({
    inputRef,
  });

  const { handleCloseOverlay, handleSelectResult, selectRecentQuery } = useMobileSearchHandlers({
    open,
    inputRef,
    setQuery,
    clear,
    handleClose,
    handleResultClick,
    onClose,
  });

  const { selectedIndex } = useSearchKeyboardNav({
    containerRef,
    resultCount: orderedHits.length,
    onSelect: (index) => {
      const hit = orderedHits[index];
      if (hit !== undefined) handleSelectResult(hit.uri, hit.data);
    },
    onClose: handleCloseOverlay,
  });

  useAutoFocusOnOpen(open, inputRef);
  useFocusTrap({ containerRef, active: open });

  const showPanel = query.length > 0 || queries.length > 0;
  const activeDescendantId =
    showPanel && selectedIndex >= 0
      ? `${MOBILE_SEARCH_LISTBOX_ID}-option-${selectedIndex}`
      : undefined;

  return {
    inputRef,
    containerRef,
    query,
    queries,
    sections,
    showPanel,
    selectedIndex,
    activeDescendantId,
    handleChange,
    handleClear,
    handleCloseOverlay,
    handleSelectResult,
    handleShowMore,
    selectRecentQuery,
    clearAllRecent: clearAll,
  };
}
