import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';

import { i18n } from '.';

describe('finance translations', () => {
  it('registers under the finance namespace', () => {
    expect(i18n.namespace).toBe('finance');
  });

  it('ships every supported locale with the same non-empty keys', () => {
    expect(localeCatalogueProblems(i18n.resources)).toEqual([]);
  });

  it('resolves the transactions labels that once rendered as raw keys (#2454, #2611)', async () => {
    const instance = createInstance();
    await instance.init({
      lng: 'en-AU',
      resources: { 'en-AU': { finance: i18n.resources['en-AU'] } },
    });
    const t = instance.getFixedT('en-AU', 'finance');

    expect(t('dashboard')).toBe('Dashboard');
    expect(t('budgets')).toBe('Budgets');
    expect(t('transactions')).toBe('Transactions');
    expect(t('filter.account')).toBe('Account');
    expect(t('filter.type')).toBe('Type');
    expect(t('filter.tag')).toBe('Tag');
    expect(t('column.date')).toBe('Date');
    expect(t('column.description')).toBe('Description');
    expect(t('column.account')).toBe('Account');
    expect(t('column.amount')).toBe('Amount');
    expect(t('column.type')).toBe('Type');
    expect(t('column.tags')).toBe('Tags');
    expect(t('rules.title')).toBe('Categorisation Rules');
    expect(t('transactions.totalCount', { count: 42 })).toBe('42 total transactions');
  });
});
