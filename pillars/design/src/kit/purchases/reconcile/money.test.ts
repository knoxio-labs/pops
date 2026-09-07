import { describe, expect, it } from 'vitest';

import { deltaState } from './money';

describe('deltaState', () => {
  it('reads a zero delta as balanced', () => {
    expect(deltaState(0)).toBe('balanced');
  });

  it('reads a negative delta as short of the charge', () => {
    expect(deltaState(-1)).toBe('short');
    expect(deltaState(-12_400)).toBe('short');
  });

  it('reads a positive delta as over-linked', () => {
    expect(deltaState(1)).toBe('over');
    expect(deltaState(39_900)).toBe('over');
  });
});
