import { useSyncExternalStore } from 'react';

const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(TABLET_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(TABLET_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Media query match for tablet range (md but not lg) */
export function useIsTablet(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
