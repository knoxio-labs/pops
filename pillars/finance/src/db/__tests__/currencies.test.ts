/**
 * Invariant tests for the currencies service against an in-memory SQLite
 * carrying the migrated finance schema — DB + service layer only.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { CurrencyConflictError, CurrencyInUseError, CurrencyNotFoundError } from '../errors.js';
import { createAccount } from '../services/accounts.js';
import {
  createCurrency,
  deleteCurrency,
  getCurrency,
  isCurrencyInUse,
  listCurrencies,
} from '../services/currencies.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

describe('listCurrencies', () => {
  it('returns the seeded fiat and points currencies, ordered by code', () => {
    const db = freshDb();
    const rows = listCurrencies(db);
    const codes = rows.map((r) => r.code);

    expect(codes).toEqual(codes.toSorted());
    expect(codes).toContain('AUD');
    const points = rows.filter((r) => r.kind === 'points');
    expect(points.length).toBeGreaterThanOrEqual(1);
    for (const row of points) {
      expect(row.symbol).toBeNull();
      expect(row.decimals).toBe(0);
    }
  });
});

describe('createCurrency', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a fiat currency with the supplied fields', () => {
    const created = createCurrency(db, {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });

    expect(created).toMatchObject({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
  });

  it('inserts a points currency with a null symbol', () => {
    const created = createCurrency(db, {
      code: 'FLYBUYS',
      name: 'Flybuys Points',
      decimals: 0,
      kind: 'points',
    });

    expect(created.symbol).toBeNull();
    expect(created.kind).toBe('points');
  });

  it('round-trips through getCurrency', () => {
    createCurrency(db, {
      code: 'NZD',
      name: 'New Zealand Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    expect(getCurrency(db, 'NZD').name).toBe('New Zealand Dollar');
  });

  it('throws CurrencyConflictError for a duplicate code', () => {
    createCurrency(db, {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    expect(() =>
      createCurrency(db, { code: 'CAD', name: 'Duplicate', symbol: '$', decimals: 2, kind: 'fiat' })
    ).toThrow(CurrencyConflictError);
  });
});

describe('getCurrency', () => {
  it('throws CurrencyNotFoundError for a missing code', () => {
    const db = freshDb();
    expect(() => getCurrency(db, 'ZZZ')).toThrow(CurrencyNotFoundError);
  });
});

describe('isCurrencyInUse', () => {
  it('is true for AUD — the migration seeds the Amex/ANZ accounts against it', () => {
    const db = freshDb();
    expect(isCurrencyInUse(db, 'AUD')).toBe(true);
  });

  it('is false for a currency nothing references', () => {
    const db = freshDb();
    createCurrency(db, {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    expect(isCurrencyInUse(db, 'CAD')).toBe(false);
  });

  it('is true once an account references it (accounts.currency, POPS-2767)', () => {
    const db = freshDb();
    createCurrency(db, {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    createAccount(db, { name: 'Canadian Cash', kind: 'cash', currency: 'CAD' });

    expect(isCurrencyInUse(db, 'CAD')).toBe(true);
  });
});

describe('deleteCurrency', () => {
  it('deletes an unused currency', () => {
    const db = freshDb();
    createCurrency(db, {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });

    deleteCurrency(db, 'CAD');

    expect(() => getCurrency(db, 'CAD')).toThrow(CurrencyNotFoundError);
  });

  it('throws CurrencyNotFoundError deleting a missing code', () => {
    const db = freshDb();
    expect(() => deleteCurrency(db, 'ZZZ')).toThrow(CurrencyNotFoundError);
  });

  it('throws CurrencyInUseError deleting AUD — the seeded Amex/ANZ accounts reference it', () => {
    const db = freshDb();
    expect(() => deleteCurrency(db, 'AUD')).toThrow(CurrencyInUseError);
  });
});
