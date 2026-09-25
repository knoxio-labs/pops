/**
 * The page's one undo offer (spec 3.5, owner decision 8): an act shows a
 * toast with Undo for eight seconds, and Cmd-Z undoes it only while that
 * toast is on screen. With no toast showing, Cmd-Z is left to the browser.
 */
import { useCallback, useEffect, useState } from 'react';

import { UNDO_WINDOW_MS, isTypingTarget, matchesCombo } from '../foundation';

import type { InventoryConcept, KeyInput } from '../foundation';

/** The toast on screen, if any. */
export interface UndoOffer {
  concept: InventoryConcept;
  message: string;
  state: 'offered' | 'undone' | 'conflict';
}

/** Whether a key press should undo: Cmd-Z, outside a text field, while an offer is showing. */
export function undoKeyApplies(
  input: KeyInput,
  target: { tagName?: string; isContentEditable?: boolean } | null,
  offer: UndoOffer | null
): boolean {
  if (offer?.state !== 'offered') return false;
  if (isTypingTarget(target)) return false;
  return matchesCombo(input, 'Mod+z');
}

/** The undo offer and its controls. `persist` keeps a review state's toast from timing out. */
export function useUndoToast(initial: UndoOffer | null = null, persist = false) {
  const [offer, setOffer] = useState<UndoOffer | null>(initial);
  const show = useCallback((concept: InventoryConcept, message: string) => {
    setOffer({ concept, message, state: 'offered' });
  }, []);
  const undo = useCallback(() => {
    setOffer((current) => (current === null ? null : { ...current, state: 'undone' }));
  }, []);
  const dismiss = useCallback(() => setOffer(null), []);

  useEffect(() => {
    if (offer === null || persist) return undefined;
    const timer = setTimeout(dismiss, offer.state === 'offered' ? UNDO_WINDOW_MS : 3000);
    return () => clearTimeout(timer);
  }, [offer, persist, dismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!undoKeyApplies(event, target, offer)) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offer, undo]);

  return { offer, show, undo, dismiss };
}
