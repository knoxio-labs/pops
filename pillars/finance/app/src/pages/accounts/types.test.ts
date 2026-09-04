import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCOUNT_FORM_VALUES,
  hasCompleteLoanTermsInput,
  loanTermsFieldsDirty,
  loanTermsPartiallyFilled,
} from './types';

const COMPLETE_LOAN_FIELDS = {
  loanOriginalPrincipal: 500_000,
  loanAnnualRatePct: 6.24,
  loanTermMonths: 360,
  loanMonthlyRepayment: 3_100,
  loanStartedOn: '2024-01-01',
  loanTermsEffectiveFrom: '2026-07-01',
};

describe('hasCompleteLoanTermsInput', () => {
  it('is false when every loan field is empty', () => {
    expect(hasCompleteLoanTermsInput(DEFAULT_ACCOUNT_FORM_VALUES)).toBe(false);
  });

  it('is true once every loan field is filled', () => {
    expect(
      hasCompleteLoanTermsInput({ ...DEFAULT_ACCOUNT_FORM_VALUES, ...COMPLETE_LOAN_FIELDS })
    ).toBe(true);
  });

  it('is false when any single field is still missing', () => {
    expect(
      hasCompleteLoanTermsInput({
        ...DEFAULT_ACCOUNT_FORM_VALUES,
        ...COMPLETE_LOAN_FIELDS,
        loanTermsEffectiveFrom: '',
      })
    ).toBe(false);
  });

  it('treats a rate of 0 as filled — a 0% rate is a real, if unusual, loan term', () => {
    expect(
      hasCompleteLoanTermsInput({
        ...DEFAULT_ACCOUNT_FORM_VALUES,
        ...COMPLETE_LOAN_FIELDS,
        loanAnnualRatePct: 0,
      })
    ).toBe(true);
  });
});

describe('loanTermsPartiallyFilled', () => {
  it('is false for a non-loan account regardless of stray field values', () => {
    expect(
      loanTermsPartiallyFilled({
        ...DEFAULT_ACCOUNT_FORM_VALUES,
        kind: 'checking',
        loanAnnualRatePct: 6.24,
      })
    ).toBe(false);
  });

  it('is false for a loan account with no terms started', () => {
    expect(loanTermsPartiallyFilled({ ...DEFAULT_ACCOUNT_FORM_VALUES, kind: 'loan' })).toBe(false);
  });

  it('is false for a loan account with every term filled', () => {
    expect(
      loanTermsPartiallyFilled({
        ...DEFAULT_ACCOUNT_FORM_VALUES,
        kind: 'loan',
        ...COMPLETE_LOAN_FIELDS,
      })
    ).toBe(false);
  });

  it('is true for a loan account with only some terms filled', () => {
    expect(
      loanTermsPartiallyFilled({
        ...DEFAULT_ACCOUNT_FORM_VALUES,
        kind: 'loan',
        loanOriginalPrincipal: 500_000,
        loanAnnualRatePct: 6.24,
      })
    ).toBe(true);
  });
});

describe('loanTermsFieldsDirty', () => {
  it('is false when no field is dirty', () => {
    expect(loanTermsFieldsDirty({})).toBe(false);
  });

  it('is false when only unrelated fields (name, currency) are dirty', () => {
    expect(loanTermsFieldsDirty({ name: true, currency: true })).toBe(false);
  });

  it('is true when a single loan-terms field is dirty', () => {
    expect(loanTermsFieldsDirty({ loanAnnualRatePct: true })).toBe(true);
  });

  it('is true when every loan-terms field is dirty', () => {
    expect(
      loanTermsFieldsDirty({
        loanOriginalPrincipal: true,
        loanAnnualRatePct: true,
        loanTermMonths: true,
        loanMonthlyRepayment: true,
        loanStartedOn: true,
        loanTermsEffectiveFrom: true,
      })
    ).toBe(true);
  });
});
