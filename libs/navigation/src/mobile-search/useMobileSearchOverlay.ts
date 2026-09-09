import { type RefObject, useEffect, useRef } from 'react';

import { useRecentSearches } from '../recent-searches';
import { useSearchInputData } from '../search-input/useSearchInputData';
import { useSearchInputHandlers } from '../search-input/useSearchInputHandlers';
import { useSearchInputSelection } from '../search-input/useSearchInputSelection';
import { usePanelDismiss } from '../search-results/usePanelDismiss';
import { useSearchStore } from '../searchStore';
import { useFocusTrap } from '../useFocusTrap';
import { useMobileSearchHandlers } from './useMobileSearchHandlers';

import type { SearchResultSection } from '../SearchResultsPanel';
import type { SearchHitData } from '../uri-resolver';

/**
 * id of the listbox `MobileSearchOverlay` currently owns (results or recent
 * searches — only one renders at a time), applied as the listbox root's
 * `id` and referenced by the input's `aria-controls`. Each option's own id
 * comes from the shared global `searchOptionId` scheme in
 * `search-keyboard-nav`, the same one desktop's `SearchInput` uses.
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
 * `useSearchInputSelection`), so a query behaves identically on both
 * surfaces — including keyboard nav over recent searches, which now shares
 * the same flat index space as result hits via `useSearchInputSelection`
 * instead of being reachable by mouse only.
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
  const clear = useSearchStore((s) => s.clear);
  const { queries, addQuery, clearAll } = useRecentSearches();

  const { sections, orderedHits, handleShowMore } = useSearchInputData({ query, isOpen });
  const { handleResultClick, handleClose, handleChange, handleClear } = useSearchInputHandlers({
    inputRef,
    addQuery,
  });

  const { handleCloseOverlay, handleSelectResult } = useMobileSearchHandlers({
    inputRef,
    clear,
    handleClose,
    handleResultClick,
    onClose,
  });

  const { selectedIndex, activeDescendantId, selectRecentQuery } = useSearchInputSelection({
    containerRef,
    inputRef,
    isRecentView: query.length === 0,
    queries,
    orderedHits,
    onSelectHit: handleSelectResult,
    onClose: handleCloseOverlay,
  });

  useAutoFocusOnOpen(open, inputRef);
  useFocusTrap({ containerRef, active: open });
  usePanelDismiss(containerRef, handleCloseOverlay);

  const showPanel = query.length > 0 || queries.length > 0;

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
