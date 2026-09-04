import { currencySubtotals } from '@/kit/account-subtotals';
import { describe, expect, it } from 'vitest';

import type { AccountKind } from '@/fixtures/account-kinds';
import type { Account } from '@/fixtures/accounts';

function account(overrides: Partial<Account> & Pick<Account, 'id' | 'balance'>): Account {
  return {
    name: overrides.id,
    kind: 'checking' as AccountKind,
    currency: 'AUD',
    archived: false,
    order: 1,
    transactionCount: 0,
    ...overrides,
  };
}

describe('currencySubtotals', () => {
  it('sums signed balances within a currency, netting a liability against an asset', () => {
    const result = currencySubtotals([
      account({ id: 'a1', balance: 100_000, currency: 'AUD' }),
      account({ id: 'a2', balance: -30_000, currency: 'AUD', kind: 'credit-card' }),
    ]);
    expect(result).toEqual([{ currency: 'AUD', total: 70_000 }]);
  });

  it('never blends two currencies into one figure', () => {
    const result = currencySubtotals([
      account({ id: 'a1', balance: 100_000, currency: 'AUD' }),
      account({ id: 'a2', balance: 5_000, currency: 'EUR' }),
    ]);
    expect(result).toEqual([
      { currency: 'AUD', total: 100_000 },
      { currency: 'EUR', total: 5_000 },
    ]);
  });

  it('excludes a points balance from every total, in whichever currency it holds points', () => {
    const result = currencySubtotals([
      account({ id: 'a1', balance: 100_000, currency: 'AUD' }),
      account({ id: 'a2', balance: 184_320, currency: 'MR', kind: 'other' }),
    ]);
    expect(result).toEqual([{ currency: 'AUD', total: 100_000 }]);
  });

  it('excludes an archived account from its currency subtotal', () => {
    const result = currencySubtotals([
      account({ id: 'a1', balance: 100_000, currency: 'AUD' }),
      account({ id: 'a2', balance: 50_000, currency: 'AUD', archived: true }),
    ]);
    expect(result).toEqual([{ currency: 'AUD', total: 100_000 }]);
  });

  it('returns nothing for an all-points or all-archived set of accounts', () => {
    expect(
      currencySubtotals([account({ id: 'a1', balance: 1, currency: 'MR', kind: 'other' })])
    ).toEqual([]);
    expect(currencySubtotals([account({ id: 'a1', balance: 1, archived: true })])).toEqual([]);
  });
});
