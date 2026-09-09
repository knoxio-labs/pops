import { type RefObject, useCallback, useEffect } from 'react';

/**
 * Dismisses on a mousedown outside `containerRef`. Escape is handled once,
 * by `useSearchKeyboardNav`'s container-level listener — that hook already
 * fires on Escape regardless of which sub-view (results or recent searches)
 * is showing, so it is not duplicated here.
 */
export function usePanelDismiss(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose, containerRef]
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [handleOutsideClick]);
}

export function sortSections<T extends { hits: { score: number }[]; isContext: boolean }>(
  sections: T[]
): T[] {
  return [...sections]
    .filter((s) => s.hits.length > 0)
    .toSorted((a, b) => {
      if (a.isContext && !b.isContext) return -1;
      if (!a.isContext && b.isContext) return 1;
      const aMax = Math.max(...a.hits.map((h) => h.score));
      const bMax = Math.max(...b.hits.map((h) => h.score));
      return bMax - aMax;
    });
}
