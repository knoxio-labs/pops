import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { LISTS_PAGES } from '@pops/lists/manifest';

import { bundles } from '../bundles';
import { PAGE_COMPONENTS, routes } from '../routes';

/**
 * The shell's loader looks a `PageDescriptor.bundleSlot` up in this record and
 * throws when it is absent, so a slot the pillar advertises and the bundle
 * does not carry is a page that fails to mount for whoever navigates there
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 */
describe('lists bundles record', () => {
  it('carries exactly the slots the pillar manifest advertises', () => {
    const declared = LISTS_PAGES.map((page) => page.bundleSlot).toSorted();
    expect(Object.keys(bundles).toSorted()).toEqual(declared);
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  // The two mount paths must agree about which component a page is, so this
  // compares identities rather than counts: two slots and two components can
  // still be two wrong pairings.
  it('binds each slot to the component the route table mounts at that path', () => {
    for (const page of LISTS_PAGES) {
      const route = routes.find((candidate) =>
        'index' in page && page.index ? candidate.index === true : candidate.path === page.path
      );
      if (route === undefined) throw new Error(`no route for page '${page.path}'`);
      const element = route.element;
      if (!isValidElement(element)) throw new Error(`route ${page.bundleSlot} has no element`);
      expect(element.type, page.bundleSlot).toBe(bundles[page.bundleSlot]);
    }
  });

  /**
   * The detail page is a deep link with no sidebar entry, so dropping it from
   * the page list would 404 every link into a list without anything on the
   * rail looking wrong. Named rather than left to the count, which two slots
   * and two routes would satisfy either way.
   */
  it('carries the detail page, not only the index', () => {
    expect(Object.keys(bundles)).toContain('lists-detail');
    expect(routes).toHaveLength(LISTS_PAGES.length);
  });

  it('is the route table’s component map, not a copy of it', () => {
    expect(bundles).toBe(PAGE_COMPONENTS);
  });
});
