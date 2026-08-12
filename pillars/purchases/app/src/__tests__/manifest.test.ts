import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index';

describe('app-purchases module manifest', () => {
  it('declares id="purchases"', () => {
    expect(manifest.id).toBe('purchases');
  });

  it('declares an app surface', () => {
    expect(manifest.surfaces).toContain('app');
  });

  it('exposes a frontend block with routes + navConfig', () => {
    expect(manifest.frontend).toBeDefined();
    expect(manifest.frontend?.routes).toBe(routes);
    expect(manifest.frontend?.navConfig).toBe(navConfig);
  });

  it('navConfig basePath is /purchases', () => {
    expect(navConfig.basePath).toBe('/purchases');
  });

  it('navConfig labelKey is "purchases" (i18n namespace key)', () => {
    expect(navConfig.labelKey).toBe('purchases');
  });

  it('every nav item labelKey is namespaced under the app id', () => {
    for (const item of navConfig.items) {
      expect(item.labelKey.startsWith('purchases.')).toBe(true);
    }
  });

  // The rail entry and the route table have to stay the same size. A nav
  // item the shell renders with no route behind it is the dead link the
  // pillar manifest was kept empty to avoid; this pins the pair.
  it('exposes exactly the index route, one per nav item', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ index: true });
    expect(navConfig.items).toHaveLength(routes.length);
  });

  it('declares no backend slot (app surface only)', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
