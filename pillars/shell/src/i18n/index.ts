/**
 * i18next initialization for the POPS shell.
 *
 * Locales are the `SUPPORTED_LOCALES` `@pops/pillar-sdk` declares, falling
 * back to its `DEFAULT_LOCALE`. The shell registers only the namespaces it and
 * the kit read — `common`, `shell`, `navigation` and `ui`, from
 * `@pops/locales`. Each pillar owns its own namespace and ships it in its
 * remote bundle's `i18n` export; the runtime loader adds it to this instance
 * when that pillar is first loaded (`app/remote-translations.ts`), so nothing
 * here names a pillar.
 *
 * Language preference is persisted to localStorage under the key `pops-locale`.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUCommon from '@pops/locales/en-AU/common.json';
import enAUNavigation from '@pops/locales/en-AU/navigation.json';
import enAUShell from '@pops/locales/en-AU/shell.json';
import enAUUi from '@pops/locales/en-AU/ui.json';
import ptBRCommon from '@pops/locales/pt-BR/common.json';
import ptBRNavigation from '@pops/locales/pt-BR/navigation.json';
import ptBRShell from '@pops/locales/pt-BR/shell.json';
import ptBRUi from '@pops/locales/pt-BR/ui.json';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@pops/pillar-sdk';

/** LocalStorage key for persisting the user's locale choice. */
export const LOCALE_STORAGE_KEY = 'pops-locale';

function getStoredLocale(): SupportedLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

/** The shared namespaces the shell registers at init, in resource-loading order. */
export const NAMESPACES = ['common', 'shell', 'navigation', 'ui'] as const;

const i18n = createInstance();

/**
 * Mirror the active language onto `<html lang>` so screen readers pick up
 * pronunciation rules for the rendered content (WCAG 3.1.1 / 3.1.2).
 */
function syncHtmlLang(lng: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lng);
  }
}

i18n.on('languageChanged', syncHtmlLang);

void i18n.use(initReactI18next).init({
  lng: getStoredLocale(),
  fallbackLng: DEFAULT_LOCALE,
  // Copied: i18next stores this array by reference and pushes onto it from
  // `loadNamespaces`, which would mutate the exported const.
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  // A pillar's namespace is added when its bundle loads, which can be after
  // the shell has rendered something keyed into it — the capture modal's
  // title names the overlay pillar's namespace — so an added bundle has to
  // re-render whatever reads through `useTranslation`.
  react: { bindI18nStore: 'added' },
  resources: {
    'en-AU': {
      common: enAUCommon,
      shell: enAUShell,
      navigation: enAUNavigation,
      ui: enAUUi,
    },
    'pt-BR': {
      common: ptBRCommon,
      shell: ptBRShell,
      navigation: ptBRNavigation,
      ui: ptBRUi,
    },
  },
});

// `init` does not fire `languageChanged` for the initial language, so set it
// explicitly here to cover first-paint screen-reader behaviour.
syncHtmlLang(i18n.language || DEFAULT_LOCALE);

export default i18n;
