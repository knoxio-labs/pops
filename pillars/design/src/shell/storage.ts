import { useCallback, useState } from 'react';

/**
 * A `useState` whose value survives reloads in `localStorage`. Every read
 * and write is guarded: a private window, cleared site data or a browser
 * that blocks storage throws on the accessor itself, and the playground must
 * render regardless.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
  serialize: (value: T) => string
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : parse(raw);
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, serialize(next));
      } catch {
        // Storage unavailable: the in-memory value still applies for this page.
      }
    },
    [key, serialize]
  );
  return [value, set];
}

const identity = (raw: string): string => raw;

/** {@link useStoredState} for a string value. */
export function useStoredString(key: string, fallback: string): [string, (next: string) => void] {
  return useStoredState(key, fallback, identity, identity);
}
