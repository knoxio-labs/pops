import { describe, expect, it } from 'vitest';

import { formatCombo, matchesCombo, parseCombo } from './key-combo';

describe('parseCombo', () => {
  it('parses modifier names and key names case-insensitively', () => {
    expect(parseCombo('mOd+aLt+sHiFt+eNTER')).toEqual({
      key: 'enter',
      mod: true,
      shift: true,
      alt: true,
    });
  });

  it('parses an unmodified punctuation key', () => {
    expect(parseCombo('?')).toEqual({ key: '?', mod: false, shift: false, alt: false });
  });
});

describe('formatCombo', () => {
  it('formats modifiers as Mac symbols in registry order', () => {
    expect(formatCombo('Mod+Alt+Shift+c')).toEqual(['⌘', '⌥', '⇧', 'C']);
  });

  it('formats modifiers as words on other platforms', () => {
    expect(formatCombo('Mod+Alt+Shift+c', 'other')).toEqual(['Ctrl', 'Alt', 'Shift', 'C']);
  });

  it('uses readable key caps for named keys', () => {
    expect(formatCombo('Escape')).toEqual(['Esc']);
    expect(formatCombo('Backspace')).toEqual(['Backspace']);
    expect(formatCombo('Tab')).toEqual(['Tab']);
    expect(formatCombo('Space')).toEqual(['Space']);
    expect(formatCombo('ArrowDown')).toEqual(['↓']);
    expect(formatCombo('ArrowUp')).toEqual(['↑']);
  });
});

describe('matchesCombo', () => {
  it('accepts either Cmd or Ctrl for Mod', () => {
    expect(matchesCombo({ key: 'k', metaKey: true }, 'Mod+k')).toBe(true);
    expect(matchesCombo({ key: 'k', ctrlKey: true }, 'Mod+k')).toBe(true);
  });

  it('rejects missing or extra modifiers', () => {
    expect(matchesCombo({ key: 'k' }, 'Mod+k')).toBe(false);
    expect(matchesCombo({ key: 'n', metaKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n', altKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n', shiftKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n', altKey: true }, 'Shift+n')).toBe(false);
  });

  it('requires Shift for explicit Shift combos and shifted letters', () => {
    expect(matchesCombo({ key: 'N', shiftKey: true }, 'Shift+n')).toBe(true);
    expect(matchesCombo({ key: 'N', shiftKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n' }, 'Shift+n')).toBe(false);
  });

  it('does not infer a layout-dependent Shift requirement for punctuation', () => {
    expect(matchesCombo({ key: '?', shiftKey: true }, '?')).toBe(true);
    expect(matchesCombo({ key: '?', shiftKey: false }, '?')).toBe(true);
  });

  it('normalizes the spacebar event key', () => {
    expect(matchesCombo({ key: ' ' }, 'Space')).toBe(true);
    expect(matchesCombo({ key: 'space' }, 'Space')).toBe(true);
  });
});
