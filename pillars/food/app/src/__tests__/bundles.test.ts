import { describe, expect, it } from 'vitest';

import { bundles } from '../bundles';
import { PAGE_COMPONENTS } from '../routes';
import { allPageSlots } from './page-slots';

/**
 * The shell's loader looks a `PageDescriptor.bundleSlot` up in this record and
 * throws when it is absent, so a slot the pillar advertises and the bundle
 * does not carry is a page that fails to mount for whoever navigates there
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 *
 * food is the first pillar whose pages nest, so every assertion here walks the
 * tree. Against `FOOD_PAGES` directly they would cover the fifteen top-level
 * pages and skip the eight `data` tabs.
 */
describe('food bundles record', () => {
  it('carries exactly the slots the pillar manifest advertises, nested ones included', () => {
    expect(Object.keys(bundles).toSorted()).toEqual(allPageSlots().toSorted());
  });

  // The count is stated because the two lists could agree while both being
  // truncated to the top level — which is the failure a flatten bug produces.
  it('covers the data tabs, not only the top-level pages', () => {
    const slots = Object.keys(bundles);
    expect(slots).toContain('food-data-layout');
    expect(slots).toContain('food-data-ingredients');
    expect(slots).toContain('food-data-substitutions-graph');
    expect(allPageSlots().length).toBeGreaterThan(FIFTEEN_TOP_LEVEL_PAGES);
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  it('binds a distinct component to every slot', () => {
    expect(new Set(Object.values(bundles)).size).toBe(allPageSlots().length);
  });

  // `bundles` must be `PAGE_COMPONENTS` under the wire's name rather than a
  // second table, or the two mount paths can disagree about which component a
  // page is.
  it('is the route table’s component map, not a copy of it', () => {
    expect(bundles).toBe(PAGE_COMPONENTS);
  });
});

/** `FOOD_PAGES` has fifteen entries at its top level; the tabs are beneath. */
const FIFTEEN_TOP_LEVEL_PAGES = 15;
