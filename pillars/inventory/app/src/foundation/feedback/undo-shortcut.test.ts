import { describe, expect, it } from 'vitest';

import { undoKeyApplies } from './undo-shortcut';

import type { UndoOffer } from './undo-shortcut';

const offer: UndoOffer = { concept: 'move', message: 'Moved a box', state: 'offered' };
const body = { tagName: 'BODY' };
const cmdZ = { key: 'z', metaKey: true };

describe('undoKeyApplies', () => {
  it('accepts Cmd-Z and Ctrl-Z outside typing targets', () => {
    expect(undoKeyApplies(cmdZ, body, offer)).toBe(true);
    expect(undoKeyApplies({ key: 'z', ctrlKey: true }, body, offer)).toBe(true);
  });

  it('rejects missing, completed, and conflicting offers', () => {
    expect(undoKeyApplies(cmdZ, body, null)).toBe(false);
    expect(undoKeyApplies(cmdZ, body, { ...offer, state: 'undone' })).toBe(false);
    expect(undoKeyApplies(cmdZ, body, { ...offer, state: 'conflict' })).toBe(false);
  });

  it('leaves input-like and contenteditable targets alone', () => {
    for (const target of [
      { tagName: 'INPUT' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { isContentEditable: true },
    ]) {
      expect(undoKeyApplies(cmdZ, target, offer)).toBe(false);
    }
  });

  it('rejects plain Z, shifted Z, and extra modifiers', () => {
    expect(undoKeyApplies({ key: 'z' }, body, offer)).toBe(false);
    expect(undoKeyApplies({ key: 'Z', metaKey: true, shiftKey: true }, body, offer)).toBe(false);
    expect(undoKeyApplies({ key: 'z', metaKey: true, altKey: true }, body, offer)).toBe(false);
  });
});
