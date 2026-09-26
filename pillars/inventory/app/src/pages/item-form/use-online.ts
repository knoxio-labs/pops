import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const browserSnapshot = (): boolean => navigator.onLine;
const serverSnapshot = (): boolean => true;

/** Returns the browser's current connectivity state without reading it during render only. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
