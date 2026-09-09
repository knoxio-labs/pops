import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

/**
 * The app's own i18next instance, for when nothing else provides one.
 *
 * Mounted in the shell, this app renders inside the shell's instance and this
 * module is not loaded. Running standalone — or under vitest — there is no
 * shell, and `useTranslation` without an instance renders raw keys on every
 * page. One namespace, because this app reads one.
 *
 * Shared by the standalone entry and the test setup rather than written twice:
 * two copies would let the harness a person looks at and the harness the tests
 * assert against drift into different translations.
 */
export function createPurchasesI18n(): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: 'en-AU',
    fallbackLng: 'en-AU',
    ns: ['purchases'],
    defaultNS: 'purchases',
    interpolation: { escapeValue: false },
    resources: { 'en-AU': { purchases: enAUPurchases } },
  });
  return instance;
}
