import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Kbd,
  KeyCombo,
  formatCombo,
  matchesCombo,
  parseCombo,
  type Combo,
  type KeyInput,
} from '../index';

describe('keyboard combos', () => {
  it('parses modifiers case-insensitively', () => {
    expect(parseCombo('Mod+Shift+Enter')).toEqual({
      key: 'enter',
      mod: true,
      shift: true,
      alt: false,
    });
    expect(parseCombo('?')).toEqual({ key: '?', mod: false, shift: false, alt: false });
  });

  it('formats as Mac key caps or as words elsewhere', () => {
    expect(formatCombo('Mod+k')).toEqual(['⌘', 'K']);
    expect(formatCombo('Mod+Alt+Shift+c', 'other')).toEqual(['Ctrl', 'Alt', 'Shift', 'C']);
    expect(formatCombo('Escape')).toEqual(['Esc']);
    expect(formatCombo('ArrowDown')).toEqual(['↓']);
  });

  it('matches Cmd or Ctrl for Mod, and refuses a missing or extra modifier', () => {
    expect(matchesCombo({ key: 'k', metaKey: true }, 'Mod+k')).toBe(true);
    expect(matchesCombo({ key: 'k', ctrlKey: true }, 'Mod+k')).toBe(true);
    expect(matchesCombo({ key: 'k' }, 'Mod+k')).toBe(false);
    expect(matchesCombo({ key: 'n', metaKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n', altKey: true }, 'n')).toBe(false);
  });

  it('tells a letter from its shifted form, but not ? from its layout-dependent Shift', () => {
    expect(matchesCombo({ key: 'N', shiftKey: true }, 'Shift+n')).toBe(true);
    expect(matchesCombo({ key: 'N', shiftKey: true }, 'n')).toBe(false);
    expect(matchesCombo({ key: 'n' }, 'Shift+n')).toBe(false);
    expect(matchesCombo({ key: '?', shiftKey: true }, '?')).toBe(true);
    expect(matchesCombo({ key: ' ' }, 'Space')).toBe(true);
  });
});

describe('KeyCombo', () => {
  it('renders a token-backed key cap', () => {
    render(<Kbd>G</Kbd>);

    const cap = screen.getByText('G');
    expect(cap.tagName).toBe('KBD');
    expect(cap).toHaveClass(
      'inline-flex',
      'h-5',
      'min-w-5',
      'rounded',
      'border-border',
      'bg-muted',
      'text-2xs',
      'text-muted-foreground'
    );
  });

  it('renders one cap per key and labels a sequence with then', () => {
    render(<KeyCombo sequence={['g', 'i']} />);

    const sequence = screen.getByLabelText('G then I');
    expect(within(sequence).getAllByText(/G|I/u)).toHaveLength(2);
    expect(sequence.querySelectorAll('kbd')).toHaveLength(2);
    expect(sequence.querySelectorAll('kbd')[1]).toHaveClass('ml-1');
  });

  it('renders Mod+Shift+c as ⌘ ⇧ C', () => {
    render(<KeyCombo sequence={['Mod+Shift+c']} />);

    const combo = screen.getByLabelText('⌘ ⇧ C');
    expect(within(combo).getAllByText(/⌘|⇧|C/u)).toHaveLength(3);
  });

  it('exports all seven names from the package index', () => {
    const combo: Combo = parseCombo('Mod+k');
    const input: KeyInput = { key: 'k', metaKey: true };

    expect(parseCombo).toBeTypeOf('function');
    expect(formatCombo).toBeTypeOf('function');
    expect(matchesCombo).toBeTypeOf('function');
    expect(Kbd).toBeTypeOf('function');
    expect(KeyCombo).toBeTypeOf('function');
    expect(matchesCombo(input, combo.mod ? 'Mod+k' : 'k')).toBe(true);
  });
});
