import { describe, expect, it } from 'vitest';

import { checkpointFormSchema, isInconsistent, today } from './types';

describe('isInconsistent', () => {
  it('is false when deltaCents is null — the earliest checkpoint has nothing to compare against', () => {
    expect(isInconsistent({ deltaCents: null })).toBe(false);
  });

  it('is false for an exact-agreement checkpoint (delta zero, not absent)', () => {
    expect(isInconsistent({ deltaCents: 0 })).toBe(false);
  });

  it('is true for a positive delta', () => {
    expect(isInconsistent({ deltaCents: 480 })).toBe(true);
  });

  it('is true for a negative delta', () => {
    expect(isInconsistent({ deltaCents: -480 })).toBe(true);
  });
});

describe('checkpointFormSchema', () => {
  const valid = { asOf: today(), note: '' };
  const parse = (signConvention: 'asset' | 'liability', amount: string) =>
    checkpointFormSchema(signConvention).safeParse({ ...valid, amount });

  it('refuses a negative amount on a liability — the field is what is owed, and the submit path negates it', () => {
    // Without this the figure copied off a card statement, "-500", is negated
    // into +50000 and the card reads as holding $500 rather than owing it.
    const result = parse('liability', '-500');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('Balance must be positive');
  });

  it('accepts a positive amount on a liability', () => {
    expect(parse('liability', '500').success).toBe(true);
  });

  it('accepts zero on a liability — a settled card owes nothing', () => {
    expect(parse('liability', '0').success).toBe(true);
  });

  it('accepts a negative amount on an asset — an overdrawn account holds less than nothing', () => {
    expect(parse('asset', '-500').success).toBe(true);
  });

  it('refuses a non-numeric amount on either convention', () => {
    expect(parse('asset', 'abc').success).toBe(false);
    expect(parse('liability', 'abc').success).toBe(false);
  });

  it('refuses an empty amount', () => {
    expect(parse('asset', '').success).toBe(false);
  });

  it('refuses a future date', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const result = checkpointFormSchema('asset').safeParse({
      amount: '100',
      asOf: tomorrow,
      note: '',
    });
    expect(result.success).toBe(false);
  });
});
