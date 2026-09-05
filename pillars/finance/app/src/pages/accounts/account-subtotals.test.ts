import { describe, expect, it } from 'vitest';

import { NO_BALANCE } from '../../test-utils.js';
import { currencySubtotals, type Currency } from './account-subtotals';

import type { Account } from './types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'id',
    name: 'Account',
    institutionId: null,
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    balance: NO_BALANCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const CURRENCIES: Currency[] = [
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimals: 2, kind: 'fiat', createdAt: '' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, kind: 'fiat', createdAt: '' },
  { code: 'QFF', name: 'Qantas Points', symbol: null, decimals: 0, kind: 'points', createdAt: '' },
];

describe('currencySubtotals', () => {
  it('nets a currency’s accounts into one signed total, per currency', () => {
    const accounts = [
      account({ id: 'a', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: 100_000 } }),
      account({ id: 'b', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: -30_000 } }),
      account({ id: 'c', currency: 'EUR', balance: { ...NO_BALANCE, balanceCents: 5_000 } }),
    ];
    expect(currencySubtotals(accounts, CURRENCIES)).toEqual([
      { currency: 'AUD', totalCents: 70_000 },
      { currency: 'EUR', totalCents: 5_000 },
    ]);
  });

  it('never sums a points currency into a subtotal', () => {
    const accounts = [
      account({ id: 'a', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: 10_000 } }),
      account({ id: 'b', currency: 'QFF', balance: { ...NO_BALANCE, balanceCents: 500_000 } }),
    ];
    const totals = currencySubtotals(accounts, CURRENCIES);
    expect(totals).toEqual([{ currency: 'AUD', totalCents: 10_000 }]);
    expect(totals.some((t) => t.currency === 'QFF')).toBe(false);
  });

  it('excludes archived accounts from the total', () => {
    const accounts = [
      account({ id: 'a', currency: 'AUD', balance: { ...NO_BALANCE, balanceCents: 10_000 } }),
      account({
        id: 'b',
        currency: 'AUD',
        archivedAt: '2026-02-01T00:00:00.000Z',
        balance: { ...NO_BALANCE, balanceCents: 90_000 },
      }),
    ];
    expect(currencySubtotals(accounts, CURRENCIES)).toEqual([
      { currency: 'AUD', totalCents: 10_000 },
    ]);
  });

  it('returns nothing for an empty account list', () => {
    expect(currencySubtotals([], CURRENCIES)).toEqual([]);
  });
});
