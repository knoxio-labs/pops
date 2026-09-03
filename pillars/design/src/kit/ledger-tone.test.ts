import { balanceTone, ledgerTone } from '@/kit/ledger-tone';
import { describe, expect, it } from 'vitest';

import type { AccountKind } from '@/fixtures/account-kinds';
import type { Account } from '@/fixtures/accounts';

function account(kind: AccountKind, balance: number, currency = 'AUD'): Account {
  return {
    id: `${kind}-${balance}`,
    name: kind,
    kind,
    currency,
    archived: false,
    order: 1,
    balance,
    transactionCount: 0,
  };
}

describe('ledgerTone', () => {
  it('is primary above zero, destructive below it, and muted at it', () => {
    expect(ledgerTone(1)).toBe('text-primary');
    expect(ledgerTone(-1)).toBe('text-destructive');
    expect(ledgerTone(0)).toBe('text-muted-foreground');
  });
});

describe('balanceTone', () => {
  it('reds a negative balance whatever the kind', () => {
    for (const kind of ['credit-card', 'loan', 'person', 'checking'] as AccountKind[]) {
      expect(balanceTone(account(kind, -213_755))).toBe('text-destructive');
    }
  });

  it('greens a positive balance whatever the kind', () => {
    for (const kind of ['savings', 'gift-card', 'person', 'credit-card'] as AccountKind[]) {
      expect(balanceTone(account(kind, 12_000))).toBe('text-primary');
    }
  });

  it('does not derive the tone from the kind, so a card in credit reads green', () => {
    expect(balanceTone(account('credit-card', 12_000))).toBe('text-primary');
    expect(balanceTone(account('checking', -12_000))).toBe('text-destructive');
  });

  it('leaves a points balance neutral, since points are not money', () => {
    expect(balanceTone(account('other', 184_320, 'MR'))).toBe('text-muted-foreground');
  });

  it('mutes a settled balance rather than calling zero spendable', () => {
    expect(balanceTone(account('person', 0))).toBe('text-muted-foreground');
  });
});
