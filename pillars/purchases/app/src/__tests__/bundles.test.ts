import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { PURCHASES_PAGES } from '@pops/purchases/manifest';

import { bundles } from '../bundles';
import { routes } from '../routes';

/**
 * The shell's loader looks a `PageDescriptor.bundleSlot` up in this record and
 * throws when it is absent, so a slot the pillar advertises and the bundle
 * does not carry is a page that fails to mount for whoever navigates there
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 */
describe('purchases bundles record', () => {
  it('carries exactly the slots the pillar manifest advertises', () => {
    const declared = PURCHASES_PAGES.map((page) => page.bundleSlot).toSorted();
    expect(Object.keys(bundles).toSorted()).toEqual(declared);
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  // The two mount paths must agree about which component a page is, and the
  // route table spells its paths out rather than deriving them (the title-icon
  // gate parses them), so this is where the two are held in step. Comparing
  // identities rather than counts is what makes that hold: four slots and four
  // components can still be four wrong pairings.
  it('binds each slot to the component the route table mounts at that path', () => {
    for (const page of PURCHASES_PAGES) {
      const route = routes.find((candidate) =>
        'index' in page && page.index ? candidate.index === true : candidate.path === page.path
      );
      if (route === undefined) throw new Error(`no route for page '${page.path}'`);
      const element = route.element;
      if (!isValidElement(element)) throw new Error(`route ${page.bundleSlot} has no element`);
      expect(element.type, page.bundleSlot).toBe(bundles[page.bundleSlot]);
    }
  });

  it('binds a distinct component to every slot', () => {
    expect(new Set(Object.values(bundles)).size).toBe(PURCHASES_PAGES.length);
  });

  // The rail-reachable routes and the slots describe one surface. A route
  // added without a page descriptor is invisible to a loader-mounted pillar;
  // the order-detail route is the deliberate exception, reached only from
  // something already holding a purchase id.
  it('covers every rail-reachable route, and only those', () => {
    const parameterised = routes.filter((route) => route.path?.includes(':') === true);
    expect(parameterised).toHaveLength(1);
    expect(routes).toHaveLength(PURCHASES_PAGES.length + parameterised.length);
  });
});
