import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUUi from '@pops/locales/en-AU/ui.json';

import enAUInventory from './locales/en-AU.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['inventory', 'ui'],
  defaultNS: 'inventory',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      inventory: enAUInventory,
      ui: enAUUi,
    },
  },
});

// Polyfill ResizeObserver for Radix UI components (popover, select, etc.)
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
