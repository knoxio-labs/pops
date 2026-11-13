import { useCallback, useSyncExternalStore } from 'react';

/** Observe the shared theme's xl breakpoint; an unavailable theme or server render remains compact. */
export function useWideWorkspace(): boolean {
  const query = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const width = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--breakpoint-xl')
      .trim();
    return width ? window.matchMedia(`(min-width: ${width})`) : undefined;
  }, []);
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = query();
      media?.addEventListener('change', notify);
      return () => media?.removeEventListener('change', notify);
    },
    [query]
  );
  const snapshot = useCallback(() => query()?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
