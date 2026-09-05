import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { iconMap } from '@pops/navigation';

import { activeItemPath, appForArea, WEB_APPS } from './apps';

import type { AppNavConfig } from '@pops/navigation';

describe('WEB_APPS', () => {
  it('is the shell rail order (navOrder in the shell bundle map), finance first', () => {
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
    // the raw key — `finance.accounts` where "Accounts" belongs. Two shipped
    // that way (POPS-2775, POPS-2810) because nothing compared the two
    // sides. `WEB_APPS` holds each pillar's real navConfig, so this covers
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
});
