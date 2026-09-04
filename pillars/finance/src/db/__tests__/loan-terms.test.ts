/**
 * Invariant tests for the loan-terms / rate-history service against an
 * in-memory SQLite carrying the migrated finance schema — DB + service layer
 * only (POPS-2829).
 *
 * The load-bearing invariant here is that `loan_terms.annual_rate_pct` never
 * disagrees with the latest `loan_rate_history` row, so most of these assert
 * on BOTH sides after a write rather than on the return value alone.
 */
import { describe, expect, it } from 'vitest';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  LoanRateNotLatestError,
  LoanTermsNotFoundError,
} from '../errors.js';
import { createAccount } from '../services/accounts.js';
import {
  getLoanRateAsOfDate,
  getLoanTerms,
  listLoanRateHistory,
  recordLoanRate,
  writeLoanTerms,
} from '../services/loan-terms.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';
import type { WriteLoanTermsInput } from '../services/loan-terms.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function makeLoanAccount(db: FinanceDb, name = 'Home Loan') {
  return createAccount(db, { name, kind: 'loan', currency: 'AUD' });
}

const TERMS: WriteLoanTermsInput = {
  originalPrincipalCents: 65_000_000,
  annualRatePct: 5.49,
  termMonths: 360,
  monthlyRepaymentCents: 368_900,
  startedOn: '2024-03-01',
  termsEffectiveFrom: '2024-03-01',
};

describe('createAccount — loan is no longer reserved', () => {
  it('creates a loan account now that the kind is day-one', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    expect(account.kind).toBe('loan');
  });
});

describe('writeLoanTerms', () => {
  it('writes terms and seeds the matching rate history row', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);

    const written = writeLoanTerms(db, account.id, TERMS);

    expect(written.originalPrincipalCents).toBe(65_000_000);
    expect(written.annualRatePct).toBe(5.49);
    expect(written.source).toBe('manual');

    const history = listLoanRateHistory(db, account.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.annualRatePct).toBe(5.49);
    expect(history[0]?.effectiveFrom).toBe('2024-03-01');
    expect(history[0]?.source).toBe('manual');
  });

  it('replaces the terms in place on a re-write at the same effective date, without a second history row', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    const corrected = writeLoanTerms(db, account.id, { ...TERMS, annualRatePct: 5.99 });

    expect(corrected.annualRatePct).toBe(5.99);
    const history = listLoanRateHistory(db, account.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.annualRatePct).toBe(5.99);
  });

  it('adds a history row when re-written at a later effective date', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    writeLoanTerms(db, account.id, {
      ...TERMS,
      annualRatePct: 6.25,
      termsEffectiveFrom: '2025-01-01',
    });

    const history = listLoanRateHistory(db, account.id);
    expect(history.map((row) => row.effectiveFrom)).toEqual(['2025-01-01', '2024-03-01']);
    expect(getLoanTerms(db, account.id).annualRatePct).toBe(6.25);
  });

  it('rejects a re-write behind a recorded rate change rather than orphaning the current rate', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);
    recordLoanRate(db, account.id, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
      source: 'manual',
    });

    expect(() =>
      writeLoanTerms(db, account.id, { ...TERMS, termsEffectiveFrom: '2024-06-01' })
    ).toThrow(LoanRateNotLatestError);

    expect(getLoanTerms(db, account.id).annualRatePct).toBe(6.25);
    expect(listLoanRateHistory(db, account.id)).toHaveLength(2);
  });

  it('throws AccountKindMismatchError for a non-loan account', () => {
    const db = freshDb();
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    expect(() => writeLoanTerms(db, cash.id, TERMS)).toThrow(AccountKindMismatchError);
  });

  it('throws AccountNotFoundError for a missing account', () => {
    const db = freshDb();
    expect(() => writeLoanTerms(db, 'does-not-exist', TERMS)).toThrow(AccountNotFoundError);
  });
});

describe('getLoanTerms', () => {
  it('throws LoanTermsNotFoundError when the account is a loan with no terms yet', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    expect(() => getLoanTerms(db, account.id)).toThrow(LoanTermsNotFoundError);
  });

  it('throws AccountKindMismatchError against a non-loan account even with no terms row', () => {
    const db = freshDb();
    const checking = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' });
    expect(() => getLoanTerms(db, checking.id)).toThrow(AccountKindMismatchError);
  });
});

describe('recordLoanRate', () => {
  it('records a later rate and mirrors it onto the terms in the same write', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    const recorded = recordLoanRate(db, account.id, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
      source: 'imported',
    });

    expect(recorded.annualRatePct).toBe(6.25);
    expect(recorded.source).toBe('imported');
    expect(getLoanTerms(db, account.id).annualRatePct).toBe(6.25);
    expect(listLoanRateHistory(db, account.id)[0]?.id).toBe(recorded.id);
  });

  it('rejects a backdated rate and leaves both sides untouched', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    expect(() =>
      recordLoanRate(db, account.id, {
        annualRatePct: 4.0,
        effectiveFrom: '2023-01-01',
        source: 'manual',
      })
    ).toThrow(LoanRateNotLatestError);

    expect(getLoanTerms(db, account.id).annualRatePct).toBe(5.49);
    expect(listLoanRateHistory(db, account.id)).toHaveLength(1);
  });

  it('rejects a rate on the same effective date as the latest, where there would be no latest row', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    expect(() =>
      recordLoanRate(db, account.id, {
        annualRatePct: 4.0,
        effectiveFrom: TERMS.termsEffectiveFrom,
        source: 'manual',
      })
    ).toThrow(LoanRateNotLatestError);
  });

  it('throws LoanTermsNotFoundError when the loan has no terms to keep in step', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);

    expect(() =>
      recordLoanRate(db, account.id, {
        annualRatePct: 6.0,
        effectiveFrom: '2025-01-01',
        source: 'manual',
      })
    ).toThrow(LoanTermsNotFoundError);
  });

  it('throws AccountKindMismatchError for a non-loan account', () => {
    const db = freshDb();
    const savings = createAccount(db, { name: 'Rainy Day', kind: 'savings', currency: 'AUD' });

    expect(() =>
      recordLoanRate(db, savings.id, {
        annualRatePct: 6.0,
        effectiveFrom: '2025-01-01',
        source: 'manual',
      })
    ).toThrow(AccountKindMismatchError);
  });
});

describe('getLoanRateAsOfDate (POPS-2830)', () => {
  it('picks the rate in force on a date between two rate changes', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);
    recordLoanRate(db, account.id, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
      source: 'manual',
    });
    recordLoanRate(db, account.id, {
      annualRatePct: 6.75,
      effectiveFrom: '2025-07-01',
      source: 'imported',
    });

    expect(getLoanRateAsOfDate(db, account.id, '2025-03-15')).toBe(6.25);
    expect(getLoanRateAsOfDate(db, account.id, '2025-07-01')).toBe(6.75);
    expect(getLoanRateAsOfDate(db, account.id, '2026-01-01')).toBe(6.75);
  });

  it('falls back to the earliest recorded rate for a date before any history', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);

    expect(getLoanRateAsOfDate(db, account.id, '2020-01-01')).toBe(5.49);
  });

  it('throws LoanTermsNotFoundError when the loan has no rate history at all', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);

    expect(() => getLoanRateAsOfDate(db, account.id, '2025-01-01')).toThrow(LoanTermsNotFoundError);
  });

  it('throws AccountKindMismatchError for a non-loan account', () => {
    const db = freshDb();
    const cash = createAccount(db, { name: 'Wallet 2', kind: 'cash', currency: 'AUD' });

    expect(() => getLoanRateAsOfDate(db, cash.id, '2025-01-01')).toThrow(AccountKindMismatchError);
  });
});

describe('listLoanRateHistory', () => {
  it('returns every rate newest effective date first', () => {
    const db = freshDb();
    const account = makeLoanAccount(db);
    writeLoanTerms(db, account.id, TERMS);
    recordLoanRate(db, account.id, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
      source: 'manual',
    });
    recordLoanRate(db, account.id, {
      annualRatePct: 6.75,
      effectiveFrom: '2025-07-01',
      source: 'imported',
    });

    expect(listLoanRateHistory(db, account.id).map((row) => row.effectiveFrom)).toEqual([
      '2025-07-01',
      '2025-01-01',
      '2024-03-01',
    ]);
  });

  it('does not leak another loan account’s rates', () => {
    const db = freshDb();
    const first = makeLoanAccount(db, 'Home Loan');
    const second = makeLoanAccount(db, 'Car Loan');
    writeLoanTerms(db, first.id, TERMS);
    writeLoanTerms(db, second.id, { ...TERMS, annualRatePct: 9.15 });

    expect(listLoanRateHistory(db, first.id).map((row) => row.annualRatePct)).toEqual([5.49]);
    expect(listLoanRateHistory(db, second.id).map((row) => row.annualRatePct)).toEqual([9.15]);
  });
});
