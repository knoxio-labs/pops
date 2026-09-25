/**
 * The item page's keys (spec 2.5, detail scope), read from the shared
 * registry so the hints on buttons and the keys that work are one list.
 * Keys typed into a field belong to the field.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

import { bindingsFor, isTypingTarget, matchesCombo } from '../foundation';

/** Handlers by registry id, e.g. `detail-move`. */
export type DetailKeyHandlers = Partial<Record<string, () => void>>;

const DETAIL_BINDINGS = bindingsFor('detail').filter(
  (binding) => binding.scope === 'detail' && binding.sequence.length === 1
);

/** The registry id a key press means on an item page, or null. */
export function detailKeyFor(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): string | null {
  const binding = DETAIL_BINDINGS.find((entry) => matchesCombo(event, entry.sequence[0] ?? ''));
  return binding?.id ?? null;
}

/** Wires the detail keys to handlers for as long as the page is mounted. */
export function useDetailKeys(handlers: DetailKeyHandlers): void {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTypingTarget(target)) return;
      const id = detailKeyFor(event);
      const handler = id === null ? undefined : latest.current[id];
      if (handler === undefined) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
