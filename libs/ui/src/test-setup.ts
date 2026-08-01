import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUUi from '@pops/locales/en-AU/ui.json';

// jsdom ships neither ResizeObserver nor Element.scrollIntoView; cmdk and the
// Radix popover/select primitives use both on mount.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['ui'],
  defaultNS: 'ui',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      ui: enAUUi,
    },
  },
});
