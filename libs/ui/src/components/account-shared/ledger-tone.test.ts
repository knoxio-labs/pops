import { describe, expect, it } from 'vitest';

import { balanceTone, ledgerTone } from './ledger-tone';

describe('ledgerTone', () => {
  it('reads a positive amount as primary', () => {
    expect(ledgerTone(100)).toBe('text-primary');
  });

  it('reads a negative amount as destructive', () => {
    expect(ledgerTone(-100)).toBe('text-destructive');
  });

  it('reads exactly zero as muted, not primary', () => {
    expect(ledgerTone(0)).toBe('text-muted-foreground');
  });
});

describe('balanceTone', () => {
  it('follows the sign rule for a fiat balance', () => {
    expect(balanceTone(100, 'fiat')).toBe('text-primary');
    expect(balanceTone(-100, 'fiat')).toBe('text-destructive');
  });

  it('stays neutral for a points balance regardless of sign', () => {
    expect(balanceTone(5000, 'points')).toBe('text-muted-foreground');
    expect(balanceTone(-5000, 'points')).toBe('text-muted-foreground');
  });
});
