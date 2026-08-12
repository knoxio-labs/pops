import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index';

import type { RouteObject } from 'react-router';

/** The nav `path` a route answers to; the index route answers to `''`. */
function navPathOf(route: RouteObject): string {
  return route.index === true ? '' : (route.path ?? '');
}

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

  // A nav item the shell renders with no route behind it is the dead link the
  // pillar manifest was kept empty to avoid. Matching the paths rather than
  // counting them is what makes this hold as the surface grows: two nav items
  // and two routes can still be a pair of dead links.
  it('has a route behind every nav item, and no route without one', () => {
    const routePaths = routes.map(navPathOf).toSorted();
    const navPaths = navConfig.items.map((item) => item.path).toSorted();
    expect(routePaths).toEqual(navPaths);
  });

  it('serves the reconcile queue from the index route', () => {
    expect(routes.some((route) => route.index === true)).toBe(true);
  });

  it('declares no backend slot (app surface only)', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
