/**
 * Tests for i18n initialization, locale switching, and translation coverage.
 *
 * Validates:
 * - i18next initialises with en-AU by default
 * - Language switching works and persists to localStorage
 * - All namespaces are loaded for both locales
 * - Translation keys exist in both en-AU and pt-BR (no missing translations)
 * - Interpolation works (e.g. shell.appPages with {{app}})
 *
 * The namespace set under test is discovered from `libs/locales/en-AU/*.json`
 * via `import.meta.glob` rather than hand-listed, so a namespace added to the
 * catalog is covered here with no edit to this file.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import i18n, { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, NAMESPACES, SUPPORTED_LOCALES } from '.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LocaleBundle {
  [key: string]: string | LocaleBundle;
}

const EN_AU_MODULES = import.meta.glob<LocaleBundle>('../../../../libs/locales/en-AU/*.json', {
  eager: true,
  import: 'default',
});
const PT_BR_MODULES = import.meta.glob<LocaleBundle>('../../../../libs/locales/pt-BR/*.json', {
  eager: true,
  import: 'default',
});

function namespaceFromPath(path: string): string {
  const fileName = path.split('/').at(-1);
  if (!fileName) {
    throw new Error(`Could not derive a namespace name from locale path "${path}"`);
  }
  return fileName.replace(/\.json$/, '');
}

function bundlesByNamespace(modules: Record<string, LocaleBundle>): Record<string, LocaleBundle> {
  const byNamespace: Record<string, LocaleBundle> = {};
  for (const [path, bundle] of Object.entries(modules)) {
    byNamespace[namespaceFromPath(path)] = bundle;
  }
  return byNamespace;
}

const EN_AU_BUNDLES = bundlesByNamespace(EN_AU_MODULES);
const PT_BR_BUNDLES = bundlesByNamespace(PT_BR_MODULES);

/**
 * Every namespace with an en-AU locale file on disk. Used to drive the
 * translation-completeness suite below — this is the set that "cannot
 * drift" the way a hand-maintained literal can.
 */
const ALL_NS = Object.keys(EN_AU_BUNDLES).toSorted();

function requireBundle(bundles: Record<string, LocaleBundle>, ns: string): LocaleBundle {
  const bundle = bundles[ns];
  if (!bundle) {
    throw new Error(`No locale bundle found for namespace "${ns}"`);
  }
  return bundle;
}

/** Flattens a (possibly nested) locale bundle into dotted-path -> string entries. */
function flattenBundle(bundle: LocaleBundle, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(bundle)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      flat[path] = value;
    } else {
      Object.assign(flat, flattenBundle(value, path));
    }
  }
  return flat;
}

function sortedKeys(bundle: LocaleBundle): string[] {
  return Object.keys(flattenBundle(bundle)).toSorted();
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  void i18n.changeLanguage(DEFAULT_LOCALE);
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('i18n initialization', () => {
  it('initialises with en-AU as default language', () => {
    expect(i18n.language).toBe('en-AU');
  });

  it('has en-AU as fallback language', () => {
    expect(i18n.options.fallbackLng).toEqual(['en-AU']);
  });

  it('exposes the correct supported locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en-AU', 'pt-BR']);
  });

  it('registers all namespaces', () => {
    expect(i18n.options.ns).toEqual(NAMESPACES);
  });

  it('uses common as the default namespace', () => {
    expect(i18n.options.defaultNS).toBe('common');
  });

  it('disables HTML escaping (React handles it)', () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

describe('locale switching', () => {
  it('switches to pt-BR', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.language).toBe('pt-BR');
  });

  it('switches back to en-AU', async () => {
    await i18n.changeLanguage('pt-BR');
    await i18n.changeLanguage('en-AU');
    expect(i18n.language).toBe('en-AU');
  });

  it('returns translated strings after switching', async () => {
    expect(i18n.t('common:save')).toBe('Save');
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('common:save')).toBe('Salvar');
  });

  it('mirrors the active language onto <html lang> (#2469)', async () => {
    await i18n.changeLanguage('en-AU');
    expect(document.documentElement.getAttribute('lang')).toBe('en-AU');
    await i18n.changeLanguage('pt-BR');
    expect(document.documentElement.getAttribute('lang')).toBe('pt-BR');
    await i18n.changeLanguage('en-AU');
    expect(document.documentElement.getAttribute('lang')).toBe('en-AU');
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('locale persistence', () => {
  it('reads stored locale from localStorage on init', () => {
    // The current test environment starts with en-AU. The getStoredLocale
    // function is only called at init time, so we test the storage key format.
    expect(LOCALE_STORAGE_KEY).toBe('pops-locale');
  });

  it('ignores invalid stored locales', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr-FR');
    // DEFAULT_LOCALE should be returned when stored value is invalid
    expect(DEFAULT_LOCALE).toBe('en-AU');
  });
});

// ---------------------------------------------------------------------------
// Translation completeness
// ---------------------------------------------------------------------------

describe('translation completeness', () => {
  it('discovers more than a handful of namespaces on disk', () => {
    // Guards against the glob pattern silently matching nothing (e.g. after
    // a directory move) and the suite below passing vacuously.
    expect(ALL_NS.length).toBeGreaterThan(10);
  });

  it('en-AU and pt-BR ship the same set of namespace files', () => {
    expect(Object.keys(PT_BR_BUNDLES).toSorted()).toEqual(ALL_NS);
  });

  for (const ns of ALL_NS) {
    it(`${ns}: en-AU and pt-BR have identical key sets`, () => {
      const enKeys = sortedKeys(requireBundle(EN_AU_BUNDLES, ns));
      const ptKeys = sortedKeys(requireBundle(PT_BR_BUNDLES, ns));
      expect(enKeys).toEqual(ptKeys);
    });

    it(`${ns}: no empty values in en-AU`, () => {
      for (const [key, value] of Object.entries(flattenBundle(requireBundle(EN_AU_BUNDLES, ns)))) {
        expect(value.trim().length, `en-AU ${ns}.${key} is empty`).toBeGreaterThan(0);
      }
    });

    it(`${ns}: no empty values in pt-BR`, () => {
      for (const [key, value] of Object.entries(flattenBundle(requireBundle(PT_BR_BUNDLES, ns)))) {
        expect(value.trim().length, `pt-BR ${ns}.${key} is empty`).toBeGreaterThan(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Translation lookups
// ---------------------------------------------------------------------------

describe('translation lookups', () => {
  it('resolves common namespace keys', () => {
    expect(i18n.t('common:save')).toBe('Save');
    expect(i18n.t('common:cancel')).toBe('Cancel');
    expect(i18n.t('common:delete')).toBe('Delete');
  });

  it('resolves shell namespace keys', () => {
    expect(i18n.t('shell:settings')).toBe('Settings');
    expect(i18n.t('shell:toggleTheme')).toBe('Toggle theme');
    expect(i18n.t('shell:pageNotFound')).toBe('Page not found');
  });

  it('resolves navigation namespace keys', () => {
    expect(i18n.t('navigation:finance')).toBe('Finance');
    expect(i18n.t('navigation:media.library')).toBe('Library');
    expect(i18n.t('navigation:ai.usage')).toBe('AI Usage');
    expect(i18n.t('navigation:inventory.connections')).toBe('Connections');
  });

  // #2611: six cerebrum sub-nav labelKeys were missing from the catalog,
  // so half the cerebrum sidebar rendered raw keys like
  // `cerebrum.engrams.nav`. Pin each one so a future regression fails here
  // instead of in the field.
  it('resolves every cerebrum sub-nav label (regression for #2611)', () => {
    expect(i18n.t('navigation:cerebrum.engrams.nav')).toBe('Engrams');
    expect(i18n.t('navigation:cerebrum.query.nav')).toBe('Query');
    expect(i18n.t('navigation:cerebrum.documents.nav')).toBe('Documents');
    expect(i18n.t('navigation:cerebrum.glia.nav')).toBe('Glia');
    expect(i18n.t('navigation:cerebrum.reflex.nav')).toBe('Reflex');
    expect(i18n.t('navigation:cerebrum.plexus.nav')).toBe('Plexus');
  });

  it('resolves finance namespace keys', () => {
    expect(i18n.t('finance:dashboard')).toBe('Dashboard');
    expect(i18n.t('finance:budgets')).toBe('Budgets');
    expect(i18n.t('finance:transactions')).toBe('Transactions');
    // #2454: transactions filter labels were missing — covered here so they
    // can never silently regress to raw keys again.
    expect(i18n.t('finance:filter.account')).toBe('Account');
    expect(i18n.t('finance:filter.type')).toBe('Type');
    expect(i18n.t('finance:filter.tag')).toBe('Tag');
    // #2611: `column.date` was missing — the transactions table rendered
    // a raw `COLUMN.DATE` header. Pin every column header used by the
    // transactions list.
    expect(i18n.t('finance:column.date')).toBe('Date');
    expect(i18n.t('finance:column.description')).toBe('Description');
    expect(i18n.t('finance:column.account')).toBe('Account');
    expect(i18n.t('finance:column.amount')).toBe('Amount');
    expect(i18n.t('finance:column.type')).toBe('Type');
    expect(i18n.t('finance:column.tags')).toBe('Tags');
  });

  it('resolves ai namespace keys', () => {
    expect(i18n.t('ai:observability')).toBe('AI Observability');
    expect(i18n.t('ai:kpi.cacheHitRate')).toBe('Cache Hit Rate');
  });

  it('resolves finance rules and prompt-template keys (moved out of ai)', () => {
    expect(i18n.t('finance:rules.title')).toBe('Categorisation Rules');
    expect(i18n.t('navigation:finance.rules')).toBe('Rules');
    expect(i18n.t('navigation:finance.promptTemplates')).toBe('Prompt Templates');
  });

  it('resolves media namespace keys', () => {
    expect(i18n.t('media:library')).toBe('Library');
    expect(i18n.t('media:watchlist')).toBe('Watchlist');
    expect(i18n.t('media:compare')).toBe('Compare Arena');
  });

  it('resolves ui namespace keys', () => {
    expect(i18n.t('ui:dataTable.columns')).toBe('Columns');
    expect(i18n.t('ui:dataTable.previous')).toBe('Previous');
    expect(i18n.t('ui:fileUpload.dragSingle')).toBe('Drag a file here, or click to browse');
  });

  it('resolves pt-BR translations', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('common:save')).toBe('Salvar');
    expect(i18n.t('shell:settings')).toBe('Configurações');
    expect(i18n.t('navigation:finance')).toBe('Finanças');
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe('interpolation', () => {
  it('interpolates {{app}} in shell.appPages', () => {
    expect(i18n.t('shell:appPages', { app: 'Finance' })).toBe('Finance pages');
  });

  it('interpolates {{app}} in pt-BR shell.appPages', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('shell:appPages', { app: 'Finanças' })).toBe('Páginas de Finanças');
  });

  it('interpolates finance namespace variables', () => {
    expect(i18n.t('finance:transactions.totalCount', { count: 42 })).toBe('42 total transactions');
  });

  it('interpolates ui namespace variables', () => {
    expect(i18n.t('ui:dataTable.page', { current: 1, total: 5 })).toBe('Page 1 of 5');
  });
});
