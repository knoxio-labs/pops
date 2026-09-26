import { matchesCombo } from '@pops/ui';

import { isTypingTarget } from '../shortcuts/shortcuts';
import { getActiveUndoOffer, runActiveUndo } from './undo-toast';

import type { KeyInput } from '@pops/ui';

import type { UndoOffer } from './undo-toast';

export type { UndoOffer } from './undo-toast';

/** Whether Cmd/Ctrl-Z can use the current undo offer. */
export function undoKeyApplies(
  input: KeyInput,
  target: { tagName?: string; isContentEditable?: boolean } | null,
  offer: UndoOffer | null
): boolean {
  return offer?.state === 'offered' && !isTypingTarget(target) && matchesCombo(input, 'Mod+z');
}

/** Handles the global Undo shortcut and reports whether it consumed the key. */
export function undoActiveToast(event: KeyboardEvent): boolean {
  if (
    !undoKeyApplies(
      event,
      event.target instanceof HTMLElement ? event.target : null,
      getActiveUndoOffer()
    )
  ) {
    return false;
  }
  runActiveUndo();
  return true;
}
