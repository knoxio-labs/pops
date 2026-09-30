import { describe, expect, it } from 'vitest';

import { codeBlocksSave, codeEntry, codeReducer, nextCode } from './code-assist';

describe('item form code assist', () => {
  it('accepts an offered code on Enter without replacing a blank suggestion with a guess', () => {
    const offered = codeReducer(codeEntry(), { type: 'suggested', suggestion: 'CAB-001' });
    expect(offered.status).toBe('offered');
    const accepted = codeReducer(offered, { type: 'accept-offered' });
    expect(accepted).toMatchObject({ value: 'CAB-001', status: 'free', freeCode: 'CAB-001' });
  });

  it('blocks a taken or checking code but lets an unavailable suggestion remain optional', () => {
    const checking = codeReducer(codeEntry(), { type: 'typed', value: 'CAB-001' });
    expect(codeBlocksSave(checking)).toBe('Checking code availability…');
    const taken = codeReducer(checking, { type: 'checked', taken: true, freeCode: null });
    expect(codeBlocksSave(taken)).toBe('That code is already used.');
    expect(codeBlocksSave(codeReducer(codeEntry(), { type: 'unavailable' }))).toBeNull();
  });

  it.each([
    ['BOX-007', 'BOX-008'],
    ['A-09', 'A-10'],
    ['A-99', 'A-100'],
    ['7', '8'],
    ['SHELF-2B-19', 'SHELF-2B-20'],
    ['CAB-99999999999999999999', 'CAB-100000000000000000000'],
  ])('bumps the trailing number of %s to %s', (code, expected) => {
    expect(nextCode(code)).toBe(expected);
  });

  it('leaves a duplicate without a code when there is no trailing number to bump', () => {
    expect(nextCode('CABLE')).toBe('');
    expect(nextCode('A1B')).toBe('');
    expect(nextCode('')).toBe('');
    expect(nextCode(null)).toBe('');
  });
});
