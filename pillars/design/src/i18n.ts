/**
 * i18next for the playground. Four `@pops/ui` components call
 * `useTranslation('ui')` and render raw keys without a provider, so the
 * playground initialises the same namespaces the shell does for them —
 * `common` and `ui` only, in the default locale. A screen that needs a
 * pillar namespace adds its resources here.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUCommon from '@pops/locales/en-AU/common.json';
import enAUUi from '@pops/locales/en-AU/ui.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['common', 'ui'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': { common: enAUCommon, ui: enAUUi },
  },
});

export default i18n;
