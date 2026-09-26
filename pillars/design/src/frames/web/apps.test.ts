import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INVENTORY_SCREEN_PAGES } from '@/fixtures/inventory/nav';
import { describe, expect, it } from 'vitest';

import { iconMap } from '@pops/navigation';

import { activeItemPath, appForArea, isSettingsScreen, railOrder, WEB_APPS } from './apps';

import type { AppNavConfig } from '@pops/navigation';

describe('railOrder', () => {
  const wire = (id: string, order?: number) => ({
    id,
    label: id,
    labelKey: id,
    icon: 'bot',
    basePath: `/${id}`,
    ...(order === undefined ? {} : { order }),
    items: [],
  });

  it('ranks by the wire nav.order, not by declaration order', () => {
    const ranked = railOrder([wire('c', 30), wire('a', 20), wire('b', 10)]);
    expect(ranked.map((nav) => nav.id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks a tie on id and puts a nav with no order last, as the shell does', () => {
    const ranked = railOrder([wire('z'), wire('m', 10), wire('b', 10)]);
    expect(ranked.map((nav) => nav.id)).toEqual(['b', 'm', 'z']);
  });
});

describe('WEB_APPS', () => {
  it('draws inventory with its designed nine-item nav: Labels and Activity folded, Settings in the Settings app', () => {
    const inventory = appForArea('inventory');
    expect(inventory?.items.map((item) => item.label)).toEqual([
      'Overview',
      'Items',
      'Containers',
      'Locations',
      'In hand',
      'Connections',
      'Types',
      'Reports',
      'Sync',
    ]);
  });

  it('is the shell rail order (each pillar contract nav.order), finance first', () => {
    expect(WEB_APPS.map((app) => app.id)).toEqual([
      'finance',
      'purchases',
      'media',
      'inventory',
      'food',
      'lists',
      'cerebrum',
      'ai',
      'bfm',
    ]);
  });

  it('draws every app and item icon through the shared map', () => {
    for (const app of WEB_APPS) {
      expect(iconMap[app.icon], `${app.id} app icon`).toBeDefined();
      for (const item of app.items) {
        expect(iconMap[item.icon], `${app.id}${item.path} item icon`).toBeDefined();
      }
    }
  });

  it('has a translation for every app and item label, in every locale', () => {
    // The rail and page nav render `t(labelKey)` with no fallback to the
    // sibling `label`, so a key absent from a catalogue reaches the user as
    // the raw key, `finance.accounts` where "Accounts" belongs. Two shipped
    // that way (POPS-2775, POPS-2810) because nothing compared the two
    // sides. `WEB_APPS` holds each pillar's contract nav, so this covers
    // every app without a second edit when one gains a page.
    const here = dirname(fileURLToPath(import.meta.url));
    const localesDir = join(here, '../../../../../libs/locales');
    const locales = readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(locales.length).toBeGreaterThan(0);

    for (const locale of locales) {
      const catalog = JSON.parse(
        readFileSync(join(localesDir, locale, 'navigation.json'), 'utf8')
      ) as Record<string, string>;
      for (const app of WEB_APPS) {
        expect(catalog[app.labelKey], `${locale}: ${app.labelKey}`).toBeDefined();
        for (const item of app.items) {
          expect(catalog[item.labelKey], `${locale}: ${item.labelKey}`).toBeDefined();
        }
      }
    }
  });

  it('gives every app a basePath matching its id, so an area resolves', () => {
    for (const app of WEB_APPS) {
      expect(app.basePath).toBe(`/${app.id}`);
    }
  });
});

describe('appForArea', () => {
  it('resolves a screen area to the app whose chrome it ships in', () => {
    expect(appForArea('finance')?.label).toBe('Finance');
  });

  it('resolves nothing for an area no app owns, rather than guessing', () => {
    expect(appForArea('not-a-pillar')).toBeUndefined();
    expect(appForArea(undefined)).toBeUndefined();
  });
});

describe('activeItemPath', () => {
  const app: AppNavConfig = {
    id: 'demo',
    label: 'Demo',
    labelKey: 'demo',
    icon: 'Zap',
    basePath: '/demo',
    items: [
      { path: '', label: 'Home', labelKey: 'demo.home', icon: 'Zap' },
      { path: '/import', label: 'Import', labelKey: 'demo.import', icon: 'Zap' },
      { path: '/import-rules', label: 'Rules', labelKey: 'demo.rules', icon: 'Zap' },
    ],
  };

  it('matches a slug naming a page exactly', () => {
    expect(activeItemPath(app, 'import')).toBe('/import');
  });

  it('matches a screen that is one stage of a page to that page', () => {
    expect(activeItemPath(app, 'import-review')).toBe('/import');
  });

  it('prefers the longest matching page, not the first', () => {
    expect(activeItemPath(app, 'import-rules-editor')).toBe('/import-rules');
  });

  it('marks nothing when no page matches, and never falls back to the index', () => {
    expect(activeItemPath(app, 'settings')).toBeUndefined();
    expect(activeItemPath(app, undefined)).toBeUndefined();
  });

  it('lands a mapped screen on its page ahead of the slug, and ignores a map to no page', () => {
    expect(activeItemPath(app, 'history', { history: '/import' })).toBe('/import');
    expect(activeItemPath(app, 'import-rules', { 'import-rules': '/import' })).toBe('/import');
    expect(activeItemPath(app, 'history', { history: '/gone' })).toBeUndefined();
  });
});

describe('inventory screens inside another page', () => {
  const inventory = appForArea('inventory');
  if (inventory === undefined) throw new Error('inventory nav missing');

  it('marks Sync for Activity, a segment of the Sync page', () => {
    expect(activeItemPath(inventory, 'sync/activity')).toBe('/sync');
    expect(activeItemPath(inventory, 'sync/sync')).toBe('/sync');
  });

  it('marks the page a screen’s folder names', () => {
    for (const slug of [
      'items/item-detail',
      'items/item-form',
      'items/lifecycle',
      'items/bulk-new',
    ]) {
      expect(activeItemPath(inventory, slug)).toBe('/items');
    }
    expect(activeItemPath(inventory, 'locations/location-page')).toBe('/locations');
    expect(activeItemPath(inventory, 'containers/moving-day')).toBe('/containers');
  });

  it('marks Overview for the overview screen, whose folder is not a nav path', () => {
    expect(activeItemPath(inventory, 'overview/overview')).toBe('');
  });

  it('marks nothing for a folder no nav page names', () => {
    expect(activeItemPath(inventory, 'search/search')).toBeUndefined();
    expect(activeItemPath(inventory, 'kit/foundation')).toBeUndefined();
  });

  it('maps every listed screen to a page the nav actually has', () => {
    const paths = new Set(inventory.items.map((item) => item.path));
    for (const path of Object.values(INVENTORY_SCREEN_PAGES)) expect(paths).toContain(path);
  });
});

describe('isSettingsScreen', () => {
  it('takes shell screens at or under settings', () => {
    expect(isSettingsScreen('shell', 'settings')).toBe(true);
    expect(isSettingsScreen('shell', 'settings/inventory')).toBe(true);
  });

  it('refuses other areas and look-alike slugs', () => {
    expect(isSettingsScreen('inventory', 'settings/inventory')).toBe(false);
    expect(isSettingsScreen('shell', 'settings-old')).toBe(false);
    expect(isSettingsScreen('shell', undefined)).toBe(false);
  });
});
