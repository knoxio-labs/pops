import { describe, expect, it } from 'vitest';

import { createFinanceI18n } from './app-i18n';

describe('createFinanceI18n', () => {
  it('translates from this app’s own catalogues in en-AU by default', () => {
    const instance = createFinanceI18n();
    expect(instance.language).toBe('en-AU');
    expect(instance.t('transactions')).toBe('Transactions');
  });

  it('carries the pt-BR catalogue too', async () => {
    const instance = createFinanceI18n();
    await instance.changeLanguage('pt-BR');
    expect(instance.t('transactions')).toBe('Transações');
  });
});
