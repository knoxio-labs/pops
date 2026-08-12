import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['purchases'],
  defaultNS: 'purchases',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      purchases: enAUPurchases,
    },
  },
});
