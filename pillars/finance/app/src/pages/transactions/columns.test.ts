import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import enAUFinance from '@pops/locales/en-AU/finance.json';
import ptBRFinance from '@pops/locales/pt-BR/finance.json';

import { buildTransactionFilters } from './columns';

import type { AccountOption } from '@pops/ui';

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

function account(overrides: Partial<AccountOption> = {}): AccountOption {
  return { id: 'a1', name: 'Up Everyday', kind: 'checking', ...overrides };
}

describe('buildTransactionFilters', () => {
  it('sources the account filter options from the accounts passed in, not the loaded transactions', () => {
    const filters = buildTransactionFilters(t, [
      account({ id: 'a1', name: 'Brand New Bank' }),
      account({ id: 'a2', name: 'Up Everyday' }),
    ]);
    const accountFilter = filters.find((f) => f.id === 'accountId');

    expect(accountFilter?.options).toEqual([
      { label: 'All Accounts', value: '' },
      { label: 'Brand New Bank', value: 'a1' },
      { label: 'Up Everyday', value: 'a2' },
    ]);
  });

  it('only offers the "All Accounts" option when no accounts are loaded', () => {
    const filters = buildTransactionFilters(t, []);
    const accountFilter = filters.find((f) => f.id === 'accountId');

    expect(accountFilter?.options).toEqual([{ label: 'All Accounts', value: '' }]);
  });

  it('excludes archived accounts from the filter options', () => {
    const filters = buildTransactionFilters(t, [
      account({ id: 'a1', name: 'Active' }),
      account({ id: 'a2', name: 'Closed', archived: true }),
    ]);
    const accountFilter = filters.find((f) => f.id === 'accountId');

    expect(accountFilter?.options).toEqual([
      { label: 'All Accounts', value: '' },
      { label: 'Active', value: 'a1' },
    ]);
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
