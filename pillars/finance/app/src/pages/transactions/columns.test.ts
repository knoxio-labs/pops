import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import enAUFinance from '@pops/locales/en-AU/finance.json';
import ptBRFinance from '@pops/locales/pt-BR/finance.json';

import { buildTransactionFilters, getDistinctAccounts } from './columns';

import type { Transaction } from './types';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['finance'],
  defaultNS: 'finance',
  interpolation: { escapeValue: false },
  resources: { 'en-AU': { finance: enAUFinance }, 'pt-BR': { finance: ptBRFinance } },
  initAsync: false,
});
const t = i18n.getFixedT<'finance'>('en-AU', 'finance');
const tPt = i18n.getFixedT<'finance'>('pt-BR', 'finance');

describe('getDistinctAccounts', () => {
  it('returns an empty list when there are no transactions loaded yet', () => {
    expect(getDistinctAccounts(undefined)).toEqual([]);
  });

  it('deduplicates repeated account names', () => {
    const transactions: Pick<Transaction, 'account'>[] = [
      { account: 'Up Everyday' },
      { account: 'Amex' },
      { account: 'Up Everyday' },
    ];
    expect(getDistinctAccounts(transactions)).toEqual(['Amex', 'Up Everyday']);
  });

  it('sorts account names alphabetically', () => {
    const transactions: Pick<Transaction, 'account'>[] = [
      { account: 'Zebra Bank' },
      { account: 'Amex' },
      { account: 'Macquarie' },
    ];
    expect(getDistinctAccounts(transactions)).toEqual(['Amex', 'Macquarie', 'Zebra Bank']);
  });

  it('surfaces an account not in any historical hardcoded list', () => {
    const transactions: Pick<Transaction, 'account'>[] = [{ account: 'Brand New Bank' }];
    expect(getDistinctAccounts(transactions)).toEqual(['Brand New Bank']);
  });
});

describe('buildTransactionFilters', () => {
  it('sources the account filter options from the accounts passed in, not a hardcoded list', () => {
    const filters = buildTransactionFilters(t, ['Brand New Bank', 'Up Everyday']);
    const accountFilter = filters.find((f) => f.id === 'account');

    expect(accountFilter?.options).toEqual([
      { label: 'All Accounts', value: '' },
      { label: 'Brand New Bank', value: 'Brand New Bank' },
      { label: 'Up Everyday', value: 'Up Everyday' },
    ]);
  });

  it('only offers the "All Accounts" option when no accounts are loaded', () => {
    const filters = buildTransactionFilters(t, []);
    const accountFilter = filters.find((f) => f.id === 'account');

    expect(accountFilter?.options).toEqual([{ label: 'All Accounts', value: '' }]);
  });

  it('offers every taxonomy type as a translated option (#3757 nit 1)', () => {
    const typeFilter = buildTransactionFilters(t, []).find((f) => f.id === 'type');

    // Every option is translated via a real key; a missing key would surface
    // as the raw 'filter.refund' string and fail this exact-match assertion.
    expect(typeFilter?.options).toEqual([
      { label: 'All Types', value: '' },
      { label: 'Expense', value: 'purchase' },
      { label: 'Transfer', value: 'transfer' },
      { label: 'Income', value: 'income' },
      { label: 'Refund', value: 'refund' },
      { label: 'Reversal', value: 'reversal' },
      { label: 'Loan', value: 'loan' },
      { label: 'Rebate', value: 'rebate' },
      { label: 'Tax', value: 'tax' },
      { label: 'Fee', value: 'fee' },
    ]);
  });

  it('translates the new type labels for pt-BR, proving locale routing (#3757 nit 1)', () => {
    const typeFilter = buildTransactionFilters(tPt, []).find((f) => f.id === 'type');
    const byValue = new Map(typeFilter?.options?.map((o) => [o.value, o.label]));

    expect(byValue.get('refund')).toBe('Reembolso');
    expect(byValue.get('reversal')).toBe('Estorno');
    expect(byValue.get('loan')).toBe('Empréstimo');
    expect(byValue.get('rebate')).toBe('Bonificação');
    expect(byValue.get('tax')).toBe('Imposto');
    expect(byValue.get('fee')).toBe('Taxa');
  });
});
