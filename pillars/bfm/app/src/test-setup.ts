import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUBfm from '@pops/locales/en-AU/bfm.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['bfm'],
  defaultNS: 'bfm',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      bfm: enAUBfm,
    },
  },
});
