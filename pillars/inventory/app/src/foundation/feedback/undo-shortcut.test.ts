import { describe, expect, it } from 'vitest';

import { undoKeyApplies } from './undo-shortcut';

const offer = { concept: 'move' as const, message: 'Moved a box', state: 'offered' as const };

describe('undoKeyApplies', () => {
  it('accepts Cmd-Z while an offer is active outside a typing target', () => {
    expect(undoKeyApplies({ key: 'z', metaKey: true }, { tagName: 'BODY' }, offer)).toBe(true);
  });

  it('rejects missing, completed and conflicting offers', () => {
    expect(undoKeyApplies({ key: 'z', metaKey: true }, null, null)).toBe(false);
    expect(undoKeyApplies({ key: 'z', metaKey: true }, null, { ...offer, state: 'undone' })).toBe(
      false
    );
    expect(undoKeyApplies({ key: 'z', metaKey: true }, null, { ...offer, state: 'conflict' })).toBe(
      false
    );
  });

  it('leaves typing targets, plain Z and Shift-Z alone', () => {
    expect(undoKeyApplies({ key: 'z', metaKey: true }, { tagName: 'INPUT' }, offer)).toBe(false);
    expect(undoKeyApplies({ key: 'z' }, null, offer)).toBe(false);
    expect(undoKeyApplies({ key: 'Z', metaKey: true, shiftKey: true }, null, offer)).toBe(false);
  });
});
