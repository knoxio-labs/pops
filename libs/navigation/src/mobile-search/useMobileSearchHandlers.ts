import { type RefObject, useCallback, useEffect, useRef } from 'react';

import type { SearchHitData } from '../uri-resolver';

interface UseMobileSearchHandlersArgs {
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  setQuery: (query: string) => void;
  clear: () => void;
  handleClose: () => void;
  handleResultClick: (uri: string, data?: SearchHitData) => void;
  onClose: () => void;
}

interface UseMobileSearchHandlersResult {
  handleCloseOverlay: () => void;
  handleSelectResult: (uri: string, data: SearchHitData) => void;
  selectRecentQuery: (recentQuery: string) => void;
}

/**
 * `SearchResultsPanel` owns its own document-level Escape/outside-click
 * dismissal (`usePanelDismiss`) on top of the container-level Escape
 * `useSearchKeyboardNav` already handles for `MobileSearchOverlay` — the
 * same overlap exists on desktop today. Both listeners fire for one Escape
 * press, so `handleCloseOverlay` guards `onClose` down to a single call per
 * press rather than exposing the overlap to every consumer.
 */
export function useMobileSearchHandlers({
  open,
  inputRef,
  setQuery,
  clear,
  handleClose,
  handleResultClick,
  onClose,
}: UseMobileSearchHandlersArgs): UseMobileSearchHandlersResult {
  const closingRef = useRef(false);
  useEffect(() => {
    if (open) closingRef.current = false;
  }, [open]);

  const handleCloseOverlay = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    handleClose();
    clear();
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  }, [handleClose, clear, onClose, inputRef]);

  const handleSelectResult = useCallback(
    (uri: string, data: SearchHitData) => {
      handleResultClick(uri, data);
      onClose();
    },
    [handleResultClick, onClose]
  );

  const selectRecentQuery = useCallback(
    (recentQuery: string) => {
      if (inputRef.current) inputRef.current.value = recentQuery;
      setQuery(recentQuery);
    },
    [inputRef, setQuery]
  );

  return { handleCloseOverlay, handleSelectResult, selectRecentQuery };
}
