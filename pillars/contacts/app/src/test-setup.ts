import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import ui from '@pops/locales/en-AU/ui.json';

import contacts from './locales/en-AU.json';

globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

void createInstance()
  .use(initReactI18next)
  .init({
    lng: 'en-AU',
    fallbackLng: 'en-AU',
    resources: { 'en-AU': { ui, contacts } },
    interpolation: { escapeValue: false },
  });
