import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index';

describe('app-bfm module manifest', () => {
  it('declares id="bfm"', () => {
    expect(manifest.id).toBe('bfm');
  });

  it('declares an app surface', () => {
    expect(manifest.surfaces).toContain('app');
  });

  it('exposes a frontend block with routes + navConfig', () => {
    expect(manifest.frontend).toBeDefined();
    expect(manifest.frontend?.routes).toBe(routes);
    expect(manifest.frontend?.navConfig).toBe(navConfig);
  });

  it('navConfig basePath is /bfm', () => {
    expect(navConfig.basePath).toBe('/bfm');
  });

  it('navConfig labelKey is "bfm" (i18n namespace key)', () => {
    expect(navConfig.labelKey).toBe('bfm');
  });

  // The rail entry is operator-facing: `bfm` is the pillar id, "Devices" is
  // what a human reads. Pinning both halves stops a rename collapsing them.
  it('navConfig id stays the pillar id while the label reads "Devices"', () => {
    expect(navConfig.id).toBe('bfm');
    expect(navConfig.label).toBe('Devices');
  });

  it('every nav item labelKey is namespaced under the app id', () => {
    for (const item of navConfig.items) {
      expect(item.labelKey.startsWith('bfm.')).toBe(true);
    }
  });

  it('exposes exactly the index route (the Devices landing page)', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ index: true });
  });

  it('declares no backend slot (app surface only)', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
