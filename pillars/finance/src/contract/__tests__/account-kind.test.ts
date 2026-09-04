/**
 * Unit tests for the account-kind ledger-behaviour helper (POPS-2767).
 *
 * `ACCOUNT_KIND_BEHAVIOURS` is declared `satisfies Record<AccountKind, ...>`,
 * so TypeScript already refuses a missing entry at compile time — these
 * tests pin the actual VALUES for every member, day-one and reserved alike,
 * so a change to one kind's behaviour is a visible, deliberate diff here
 * rather than a silent drift.
 */
import { describe, expect, it } from 'vitest';

import { ACCOUNT_KINDS, DAY_ONE_ACCOUNT_KINDS, getAccountKindBehaviour } from '../account-kind.js';

describe('getAccountKindBehaviour — day-one kinds', () => {
  it('checking is an asset with an external balance and is not stored value', () => {
    expect(getAccountKindBehaviour('checking')).toEqual({
      signConvention: 'asset',
      hasExternalBalance: true,
      isStoredValue: false,
    });
  });

  it('savings is an asset with an external balance and is not stored value', () => {
    expect(getAccountKindBehaviour('savings')).toEqual({
      signConvention: 'asset',
      hasExternalBalance: true,
      isStoredValue: false,
    });
  });

  it('credit-card is a liability with an external balance and is not stored value', () => {
    expect(getAccountKindBehaviour('credit-card')).toEqual({
      signConvention: 'liability',
      hasExternalBalance: true,
      isStoredValue: false,
    });
  });

  it('cash is an asset with no external balance and is not stored value', () => {
    expect(getAccountKindBehaviour('cash')).toEqual({
      signConvention: 'asset',
      hasExternalBalance: false,
      isStoredValue: false,
    });
  });

  it('gift-card is an asset, has no external balance, and IS stored value', () => {
    expect(getAccountKindBehaviour('gift-card')).toEqual({
      signConvention: 'asset',
      hasExternalBalance: false,
      isStoredValue: true,
    });
  });

  it('person is an asset (positive balance = they owe you), no external balance, not stored value', () => {
    expect(getAccountKindBehaviour('person')).toEqual({
      signConvention: 'asset',
      hasExternalBalance: false,
      isStoredValue: false,
    });
  });

  it('loan is a liability with an external balance and is not stored value', () => {
    expect(getAccountKindBehaviour('loan')).toEqual({
      signConvention: 'liability',
      hasExternalBalance: true,
      isStoredValue: false,
    });
  });

  it('loan is a day-one kind, not a reserved one (POPS-2829)', () => {
    expect(DAY_ONE_ACCOUNT_KINDS).toContain('loan');
    expect(getAccountKindBehaviour('loan')).not.toEqual(getAccountKindBehaviour('shared'));
  });

  it('credit-card and loan are the only liability kinds', () => {
    const liabilityKinds = ACCOUNT_KINDS.filter(
      (kind) => getAccountKindBehaviour(kind).signConvention === 'liability'
    );
    expect(liabilityKinds.toSorted()).toEqual(['credit-card', 'loan']);
  });

  it('gift-card is the only kind where isStoredValue is true', () => {
    for (const kind of ACCOUNT_KINDS) {
      expect(getAccountKindBehaviour(kind).isStoredValue).toBe(kind === 'gift-card');
    }
  });
});

describe('getAccountKindBehaviour — reserved kinds', () => {
  const reservedKinds = ACCOUNT_KINDS.filter(
    (kind) => !(DAY_ONE_ACCOUNT_KINDS as readonly string[]).includes(kind)
  );

  it('covers every reserved kind the day-one set does not', () => {
    expect(reservedKinds.toSorted()).toEqual(
      ['crypto', 'novated-lease', 'other', 'shared'].toSorted()
    );
  });

  it.each(reservedKinds)('%s returns the documented safe placeholder', (kind) => {
    expect(getAccountKindBehaviour(kind)).toEqual({
      signConvention: 'asset',
      hasExternalBalance: false,
      isStoredValue: false,
    });
  });
});

describe('ACCOUNT_KINDS', () => {
  it('has no duplicate members', () => {
    expect(new Set(ACCOUNT_KINDS).size).toBe(ACCOUNT_KINDS.length);
  });

  it('every day-one kind is a member of the full enum', () => {
    for (const kind of DAY_ONE_ACCOUNT_KINDS) {
      expect(ACCOUNT_KINDS).toContain(kind);
    }
  });
});
