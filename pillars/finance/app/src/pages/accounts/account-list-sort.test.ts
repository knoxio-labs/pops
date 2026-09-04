import { describe, expect, it } from 'vitest';

import { isAccountSort, sortAccounts } from './account-list-sort';

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
    expect(sortAccounts(accounts, 'kind').map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by name alphabetically regardless of kind', () => {
    const accounts = [
      account({ id: 'a', kind: 'savings', name: 'Zebra' }),
      account({ id: 'b', kind: 'checking', name: 'Alpha' }),
    ];
    expect(sortAccounts(accounts, 'name').map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('orders by most recently updated first', () => {
    const accounts = [
      account({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      account({ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' }),
      account({ id: 'c', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(sortAccounts(accounts, 'recent').map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const accounts = [account({ id: 'a', name: 'Zebra' }), account({ id: 'b', name: 'Alpha' })];
    const original = [...accounts];
    sortAccounts(accounts, 'name');
    expect(accounts).toEqual(original);
  });
});

describe('isAccountSort', () => {
  it('accepts every known sort value', () => {
    expect(isAccountSort('kind')).toBe(true);
    expect(isAccountSort('name')).toBe(true);
    expect(isAccountSort('recent')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isAccountSort('balance')).toBe(false);
    expect(isAccountSort('')).toBe(false);
  });
});
