import { describe, expect, it } from 'vitest';

import { undoKeyApplies } from './use-undo-toast';

import type { UndoOffer } from './use-undo-toast';

const offered: UndoOffer = {
  concept: 'move',
  message: 'Moved Television to Garage',
  state: 'offered',
};
const cmdZ = { key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
const body = { tagName: 'BODY' };

describe('undoKeyApplies', () => {
  it('undoes on Cmd-Z while the toast offers Undo', () => {
    expect(undoKeyApplies(cmdZ, body, offered)).toBe(true);
  });

  it('leaves Cmd-Z to the browser when no toast is showing', () => {
    expect(undoKeyApplies(cmdZ, body, null)).toBe(false);
  });

  it('does not undo twice once the toast says it is undone, or after a conflict', () => {
    expect(undoKeyApplies(cmdZ, body, { ...offered, state: 'undone' })).toBe(false);
    expect(undoKeyApplies(cmdZ, body, { ...offered, state: 'conflict' })).toBe(false);
  });

  it('leaves Cmd-Z to a text field being typed in', () => {
    expect(undoKeyApplies(cmdZ, { tagName: 'INPUT' }, offered)).toBe(false);
    expect(undoKeyApplies(cmdZ, { isContentEditable: true }, offered)).toBe(false);
  });

  it('ignores Z without the modifier and Cmd-Shift-Z', () => {
    expect(undoKeyApplies({ ...cmdZ, metaKey: false }, body, offered)).toBe(false);
    expect(undoKeyApplies({ ...cmdZ, shiftKey: true }, body, offered)).toBe(false);
  });
});
