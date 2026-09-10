import { describe, expect, it } from 'vitest';

import { CEREBRUM_CAPTURE_SLOT, CEREBRUM_PAGES } from '@pops/cerebrum/manifest';

import { bundles } from '../bundles';
import { PAGE_COMPONENTS } from '../routes';

/**
 * The shell's loader looks a slot up in this record — a `bundleSlot` for a
 * route, and the manifest's `captureOverlay.bundleSlot` for the capture modal.
 * A slot the record does not carry fails to mount for whoever reaches it
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 */
describe('cerebrum bundles record', () => {
  it('carries every page slot the pillar manifest advertises', () => {
    const declared = CEREBRUM_PAGES.map((page) => page.bundleSlot);
    for (const slot of declared) {
      expect(Object.keys(bundles), slot).toContain(slot);
    }
  });

  /**
   * The overlay is the surface that would go missing quietly: it is not a
   * route, so nothing 404s — the capture modal just opens empty, and the only
   * signal is the hotkey appearing to do nothing.
   */
  it('carries the capture-overlay slot beside the pages', () => {
    expect(Object.keys(bundles)).toContain(CEREBRUM_CAPTURE_SLOT);
    expect(CEREBRUM_PAGES.map((page) => page.bundleSlot)).not.toContain(CEREBRUM_CAPTURE_SLOT);
  });

  it('carries nothing beyond the pages and the overlay', () => {
    const expected = [...CEREBRUM_PAGES.map((p) => p.bundleSlot), CEREBRUM_CAPTURE_SLOT];
    expect(Object.keys(bundles).toSorted()).toEqual(expected.toSorted());
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

  // The page half must stay the route table's own map, or the two mount paths
  // can disagree about which component a page is.
  it('spreads the route table’s component map rather than restating it', () => {
    for (const [slot, component] of Object.entries(PAGE_COMPONENTS)) {
      expect(bundles[slot as keyof typeof bundles], slot).toBe(component);
    }
  });
});
