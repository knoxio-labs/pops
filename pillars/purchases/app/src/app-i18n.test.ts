import { describe, expect, it } from 'vitest';

import { createPurchasesI18n } from './app-i18n';

describe('createPurchasesI18n', () => {
  it('translates from this app’s own catalogues in en-AU by default', () => {
    const instance = createPurchasesI18n();
    expect(instance.language).toBe('en-AU');
    expect(instance.t('reconcile.title')).toBe('Reconcile');
  });

  it('carries the pt-BR catalogue too', async () => {
    const instance = createPurchasesI18n();
    await instance.changeLanguage('pt-BR');
    expect(instance.t('reconcile.title')).toBe('Conciliação');
  });
});
