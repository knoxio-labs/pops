import { describe, expect, it } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../test-utils.js';
import { isAccountSort, sortAccounts } from './account-list-sort';

import type { Currency } from './account-subtotals';
import type { Account } from './types';

const AUD: Currency = {
  code: 'AUD',
  name: 'Australian Dollar',
  symbol: '$',
  decimals: 2,
  kind: 'fiat',
  createdAt: '',
};
const ZAR: Currency = { ...AUD, code: 'ZAR', name: 'Rand', symbol: 'R' };
const QFF: Currency = {
  code: 'QFF',
  name: 'Qantas Points',
  symbol: null,
  decimals: 0,
  kind: 'points',
  createdAt: '',
};
const CURRENCIES = [AUD, ZAR, QFF];

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
    importStatus: NO_IMPORT_STATUS,
    transactionCount: NO_TRANSACTION_COUNT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortAccounts', () => {
  it('orders by kind first, then by name within a kind', () => {
    const accounts = [
      account({ id: 'a', kind: 'savings', name: 'Zebra Savings' }),
      account({ id: 'b', kind: 'checking', name: 'Bravo Checking' }),
      account({ id: 'c', kind: 'checking', name: 'Alpha Checking' }),
    ];
    expect(sortAccounts(accounts, 'kind', CURRENCIES).map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by name alphabetically regardless of kind', () => {
    const accounts = [
      account({ id: 'a', kind: 'savings', name: 'Zebra' }),
      account({ id: 'b', kind: 'checking', name: 'Alpha' }),
    ];
    expect(sortAccounts(accounts, 'name', CURRENCIES).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('orders by largest ledger-signed balance first', () => {
    const accounts = [
      account({ id: 'a', balance: { ...NO_BALANCE, balanceCents: -5_000 } }),
      account({ id: 'b', balance: { ...NO_BALANCE, balanceCents: 10_000 } }),
      account({ id: 'c', balance: { ...NO_BALANCE, balanceCents: 0 } }),
    ];
    expect(sortAccounts(accounts, 'balance', CURRENCIES).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('sinks points below money whatever the codes sort as, then groups by currency', () => {
    // 'QFF' < 'ZAR' alphabetically, so a code-ordered sort would put the
    // points account ahead of the rand one. Points are not money and belong
    // under all of it, whatever the letters say.
    const accounts = [
      account({
        id: 'points',
        currency: 'QFF',
        balance: { ...NO_BALANCE, balanceCents: 90_000_000 },
      }),
      account({ id: 'rand', currency: 'ZAR', balance: { ...NO_BALANCE, balanceCents: 50_000 } }),
      account({ id: 'small-aud', balance: { ...NO_BALANCE, balanceCents: 1_000 } }),
      account({ id: 'big-aud', balance: { ...NO_BALANCE, balanceCents: 10_000 } }),
    ];
    expect(sortAccounts(accounts, 'balance', CURRENCIES).map((a) => a.id)).toEqual([
      'big-aud',
      'small-aud',
      'rand',
      'points',
    ]);
  });

  it('treats a currency it has never heard of as money, not points', () => {
    // The currencies query can land after this render, and an unknown code is
    // far likelier to be a currency not yet seen than a points scheme.
    const accounts = [
      account({ id: 'points', currency: 'QFF', balance: { ...NO_BALANCE, balanceCents: 1 } }),
      account({ id: 'unknown', currency: 'XXX', balance: { ...NO_BALANCE, balanceCents: 1 } }),
    ];
    expect(sortAccounts(accounts, 'balance', CURRENCIES).map((a) => a.id)).toEqual([
      'unknown',
      'points',
    ]);
  });

  it('orders by most recently updated first', () => {
    const accounts = [
      account({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      account({ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' }),
      account({ id: 'c', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(sortAccounts(accounts, 'recent', CURRENCIES).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const accounts = [account({ id: 'a', name: 'Zebra' }), account({ id: 'b', name: 'Alpha' })];
    const original = [...accounts];
    sortAccounts(accounts, 'name', CURRENCIES);
    expect(accounts).toEqual(original);
  });
});

describe('isAccountSort', () => {
  it('accepts every known sort value', () => {
    expect(isAccountSort('kind')).toBe(true);
    expect(isAccountSort('balance')).toBe(true);
    expect(isAccountSort('name')).toBe(true);
    expect(isAccountSort('recent')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isAccountSort('kind-balance')).toBe(false);
    expect(isAccountSort('')).toBe(false);
  });
});
