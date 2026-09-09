import { useCallback } from 'react';

import type { RefObject } from 'react';

import type { SearchHitData } from '../uri-resolver';

interface UseMobileSearchHandlersArgs {
  inputRef: RefObject<HTMLInputElement | null>;
  clear: () => void;
  handleClose: () => void;
  handleResultClick: (uri: string, data?: SearchHitData) => void;
  onClose: () => void;
}

interface UseMobileSearchHandlersResult {
  handleCloseOverlay: () => void;
  handleSelectResult: (uri: string, data: SearchHitData) => void;
}

/**
 * Adds the mobile-only "dismiss the full-screen overlay" step on top of the
 * shared `useSearchInputHandlers`/`useSearchInputSelection` primitives that
 * `SearchInput` also uses — desktop's dropdown has no equivalent surface to
 * close, so `onClose` (the overlay's own open/close prop) only exists here.
 */
export function useMobileSearchHandlers({
  inputRef,
  clear,
  handleClose,
  handleResultClick,
  onClose,
}: UseMobileSearchHandlersArgs): UseMobileSearchHandlersResult {
  const handleCloseOverlay = useCallback(() => {
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

  return { handleCloseOverlay, handleSelectResult };
}
