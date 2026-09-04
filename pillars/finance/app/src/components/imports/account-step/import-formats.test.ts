import { describe, expect, it } from 'vitest';

import { bankTypesForAccount } from './import-formats';

import type { AccountOption } from '@pops/ui';

function account(overrides: Partial<AccountOption>): AccountOption {
  return {
    id: 'acc-1',
    name: 'Everyday',
    kind: 'checking',
    institution: { id: 'inst-anz', name: 'ANZ', colour: '#0072ac' },
    ...overrides,
  };
}

describe('bankTypesForAccount', () => {
  it('offers the matching bank for a recognised institution', () => {
    expect(bankTypesForAccount(account({}))).toEqual(['ANZ']);
  });

  it('matches an institution name case-insensitively', () => {
    expect(
      bankTypesForAccount(account({ institution: { id: 'inst-ing', name: 'ing', colour: '#000' } }))
    ).toEqual(['ING']);
  });

  it('narrows ANZ to its credit-card dialect for a credit-card account', () => {
    expect(bankTypesForAccount(account({ kind: 'credit-card' }))).toEqual(['ANZ Credit Card']);
  });

  it('does not narrow another institution to the ANZ credit-card dialect', () => {
    expect(
      bankTypesForAccount(
        account({
          kind: 'credit-card',
          institution: { id: 'inst-ing', name: 'ING', colour: '#000' },
        })
      )
    ).toEqual(['ING']);
  });

  it('offers nothing for a kind with no statement to export', () => {
    expect(bankTypesForAccount(account({ kind: 'cash', institution: undefined }))).toEqual([]);
  });

  it('offers nothing when the account names no institution', () => {
    expect(bankTypesForAccount(account({ institution: undefined }))).toEqual([]);
  });

  it('offers nothing for an institution nobody has written a parser for', () => {
    expect(
      bankTypesForAccount(
        account({ institution: { id: 'inst-paylab', name: 'PayLab', colour: '#000' } })
      )
    ).toEqual([]);
  });
});
