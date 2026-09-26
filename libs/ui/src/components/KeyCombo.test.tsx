import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Kbd as IndexedKbd,
  KeyCombo as IndexedKeyCombo,
  formatCombo,
  matchesCombo,
  parseCombo,
} from '../index';
import { Kbd, KeyCombo } from './KeyCombo';

import type { Combo, KeyInput } from '../index';

describe('Kbd', () => {
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
});

describe('KeyCombo', () => {
  it('renders one cap per key and labels a sequence with then', () => {
    render(<KeyCombo sequence={['g', 'i']} />);

    const sequence = screen.getByLabelText('G then I');
    expect(within(sequence).getAllByText(/G|I/u)).toHaveLength(2);
    expect(sequence.querySelectorAll('kbd')).toHaveLength(2);
    expect(sequence.querySelectorAll('kbd')[1]).toHaveClass('ml-1');
  });

  it('renders named key caps and an aria-label for a modified combo', () => {
    render(<KeyCombo sequence={['Mod+Shift+c', 'Enter']} />);

    const combo = screen.getByLabelText('⌘ ⇧ C then Enter');
    expect(within(combo).getByText('⌘')).toBeInTheDocument();
    expect(within(combo).getByText('⇧')).toBeInTheDocument();
    expect(within(combo).getByText('C')).toBeInTheDocument();
    expect(within(combo).getByText('Enter')).toHaveClass('ml-1');
  });

  it('forwards the class name and leaves an empty sequence empty', () => {
    render(<KeyCombo sequence={[]} className="shortcut-hint" />);

    const combo = screen.getByLabelText('');
    expect(combo).toHaveClass('shortcut-hint');
    expect(combo).toBeEmptyDOMElement();
  });

  it('exports the combo API from the package index', () => {
    const combo: Combo = parseCombo('Mod+k');
    const input: KeyInput = { key: 'k', metaKey: true };

    expect(formatCombo).toBeTypeOf('function');
    expect(matchesCombo(input, combo.mod ? 'Mod+k' : 'k')).toBe(true);
    expect(IndexedKbd).toBe(Kbd);
    expect(IndexedKeyCombo).toBe(KeyCombo);
  });
});
