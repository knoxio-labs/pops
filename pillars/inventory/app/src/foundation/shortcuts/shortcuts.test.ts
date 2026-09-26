import { describe, expect, it } from 'vitest';

import {
  SHORTCUTS,
  TYPING_TARGET_BINDINGS,
  bindingsFor,
  createSequenceMatcher,
  findConflicts,
  isTypingTarget,
  shortcut,
} from './shortcuts';

import type { ShortcutBinding } from './shortcuts';

describe('registry', () => {
  it('has no conflicts', () => {
    expect(findConflicts()).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = SHORTCUTS.map((binding) => binding.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the design registry counts and foundation ids', () => {
    expect(SHORTCUTS.filter((binding) => binding.scope === 'global')).toHaveLength(15);
    expect(SHORTCUTS.filter((binding) => binding.scope === 'list')).toHaveLength(15);
    expect(SHORTCUTS.filter((binding) => binding.scope === 'detail')).toHaveLength(11);
    expect(SHORTCUTS.filter((binding) => binding.scope === 'form')).toHaveLength(4);
    expect(SHORTCUTS.filter((binding) => binding.scope === 'palette')).toHaveLength(7);

    for (const id of [
      'pick-up',
      'move',
      'take-out',
      'label',
      'row-menu',
      'undo',
      'dismiss',
      'new-item',
      'bulk-entry',
    ]) {
      expect(shortcut(id).id).toBe(id);
    }
  });

  it('reports two bindings on the same keys in one scope', () => {
    const clash: ShortcutBinding[] = [
      { id: 'one', scope: 'list', sequence: ['m'], label: 'One' },
      { id: 'two', scope: 'list', sequence: ['m'], label: 'Two' },
    ];
    expect(findConflicts(clash)).toEqual([{ scope: 'list', keys: 'm', ids: ['one', 'two'] }]);
  });

  it('reports a scoped binding hiding a global one unless it says it shadows it', () => {
    const base: ShortcutBinding = { id: 'g-new', scope: 'global', sequence: ['n'], label: 'New' };
    const hides: ShortcutBinding = {
      id: 'd-next',
      scope: 'detail',
      sequence: ['n'],
      label: 'Next',
    };
    expect(findConflicts([base, hides])).toHaveLength(1);
    expect(findConflicts([base, { ...hides, shadows: 'g-new' }])).toEqual([]);
  });

  it('reports a single key that swallows a sequence prefix', () => {
    const registry: ShortcutBinding[] = [
      { id: 'go', scope: 'global', sequence: ['g', 'i'], label: 'Go' },
      { id: 'grab', scope: 'list', sequence: ['g'], label: 'Grab' },
    ];
    expect(findConflicts(registry)).toEqual([{ scope: 'list', keys: 'g', ids: ['grab', 'go'] }]);
  });

  it('keeps the palette modal: no global binding is live inside it', () => {
    expect(bindingsFor('palette').every((binding) => binding.scope === 'palette')).toBe(true);
  });

  it('lets a scope shadow a global binding and inherit the rest', () => {
    const form = bindingsFor('form').map((binding) => binding.id);
    expect(form).toContain('form-cancel');
    expect(form).not.toContain('dismiss');
    expect(form).toContain('palette');
  });

  it('throws on an unknown id so a hint cannot vanish silently', () => {
    expect(shortcut('move').sequence).toEqual(['m']);
    expect(() => shortcut('nope')).toThrow('No inventory shortcut nope');
  });

  it('keeps only the field-level bindings active while typing', () => {
    expect(TYPING_TARGET_BINDINGS).toEqual([
      'form-save',
      'form-save-new',
      'form-cancel',
      'dismiss',
    ]);
  });
});

describe('sequences', () => {
  const matcher = (): ReturnType<typeof createSequenceMatcher> =>
    createSequenceMatcher(bindingsFor('list'));

  it('fires a two-key sequence within the window', () => {
    const m = matcher();
    expect(m.feed({ key: 'g' }, 0)).toBeNull();
    expect(m.pending()).toBe('g');
    expect(m.feed({ key: 'i' }, 500)?.id).toBe('go-items');
    expect(m.pending()).toBeNull();
  });

  it('lets a sequence lapse and treats the late key on its own', () => {
    const m = matcher();
    m.feed({ key: 'g' }, 0);
    expect(m.feed({ key: 'i' }, 1001)).toBeNull();
    m.feed({ key: 'g' }, 2000);
    expect(m.feed({ key: 'm' }, 3500)?.id).toBe('move');
  });

  it('fires a single combo immediately and abandons a half sequence for an unrelated key', () => {
    const m = matcher();
    expect(m.feed({ key: 'x' }, 0)?.id).toBe('list-toggle');
    m.feed({ key: 'g' }, 10);
    expect(m.feed({ key: 'q' }, 20)).toBeNull();
    expect(m.pending()).toBeNull();
  });
});

describe('typing targets', () => {
  it('treats inputs, text areas, selects and editable content as typing', () => {
    expect(isTypingTarget({ tagName: 'input' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'select' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
