import { describe, expect, it } from 'vitest';

import { MEDIA_PAGES, MEDIA_SETTINGS_WIDGET_SLOTS } from '@pops/media/manifest';

import { bundles } from '../bundles';
import { PAGE_COMPONENTS, routes } from '../routes';

/**
 * The shell's loader looks a slot up in this record — a `bundleSlot` for a
 * route, and a settings group's `widget.bundleSlot` for a custom panel. A slot
 * the record does not carry fails to mount for whoever reaches it first.
 */
describe('media bundles record', () => {
  it('carries every page slot the pillar manifest advertises', () => {
    for (const page of MEDIA_PAGES) {
      expect(Object.keys(bundles), page.bundleSlot).toContain(page.bundleSlot);
    }
  });

  it('carries both settings-widget slots beside the pages', () => {
    for (const slot of MEDIA_SETTINGS_WIDGET_SLOTS) {
      expect(Object.keys(bundles), slot).toContain(slot);
      expect(MEDIA_PAGES.map((p) => p.bundleSlot)).not.toContain(slot);
    }
  });

  it('carries nothing beyond the pages and the widgets', () => {
    const expected = [...MEDIA_PAGES.map((p) => p.bundleSlot), ...MEDIA_SETTINGS_WIDGET_SLOTS];
    expect(Object.keys(bundles).toSorted()).toEqual(expected.toSorted());
  });

  /**
   * The page list published before POPS-3226 had eight entries for twenty
   * routes. Every route mounts from `pages` alone now, so the count is the
   * cheapest guard against that regression returning — and the paths are named
   * because a count alone would accept twenty wrong ones.
   */
  it('covers every route the app mounts, detail pages and redirects included', () => {
    expect(MEDIA_PAGES).toHaveLength(routes.length);
    const paths = MEDIA_PAGES.map((p) => p.path);
    for (const path of [
      'movies/:id',
      'tv/:id/season/:num',
      'rotation/log',
      'rotation/candidates',
      'arr/calendar',
      'compare/history',
      'quick-pick',
      'plex',
      'arr',
      'rotation',
      'calendar',
    ]) {
      expect(paths, path).toContain(path);
    }
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  it('binds a distinct component to every slot', () => {
    expect(new Set(Object.values(bundles)).size).toBe(Object.keys(bundles).length);
  });

  it('spreads the route table’s component map rather than restating it', () => {
    for (const [slot, component] of Object.entries(PAGE_COMPONENTS)) {
      expect(bundles[slot as keyof typeof bundles], slot).toBe(component);
    }
  });
});
