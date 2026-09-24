/**
 * i18next for the playground. Four `@pops/ui` components call
 * `useTranslation('ui')` and render raw keys without a provider, so the
 * playground initialises the shared namespaces the shell does for them:
 * `common` and `ui`, in the default locale. The pillar namespaces the screens
 * on the canvas read come from the playground's own fixtures, not the apps'
 * catalogues; a screen that needs another one adds a fixture here.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUCommon from '@pops/locales/en-AU/common.json';
import enAUUi from '@pops/locales/en-AU/ui.json';

import { INVENTORY_TRANSLATIONS } from './fixtures/inventory-translations';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['common', 'ui', 'inventory'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': { common: enAUCommon, inventory: INVENTORY_TRANSLATIONS, ui: enAUUi },
  },
});

export default i18n;
