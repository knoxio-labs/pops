import '@testing-library/jest-dom/vitest';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Initialize i18n for tests with English translations so components
 * that call `useTranslation('ui')` resolve to real strings instead of keys.
 *
 * Only keys exercised in tests need to be present here. The full locale
 * files live in `apps/pops-shell/src/i18n/locales/`.
 */
void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['ui'],
  defaultNS: 'ui',
  resources: {
    'en-AU': {
      ui: {
        textInput: { clearInput: 'Clear input' },
        button: { loading: 'Loading' },
        chip: { remove: 'Remove' },
        warranty: {
          noWarranty: 'No warranty',
          expired: 'Expired',
          expiresInDays: 'Expires in {{days}} days',
          warrantyUntil: 'Warranty until {{date}}',
        },
      },
    },
  },
  interpolation: { escapeValue: false },
});
