import { describe, expect, it } from 'vitest';

import { FOOD_PAGES } from '@pops/food/manifest';
import { pageTreeMismatches } from '@pops/pillar-sdk/testing';

import { PAGE_COMPONENTS, routes } from '../routes';

/**
 * The shell mounts this pillar from `FOOD_PAGES`; the app's own `routes`
 * table is kept beside it by hand. `satisfies` in `routes.tsx` pins the slot
 * set, not the tree, so a tab nested differently, a path spelled differently
 * or a slot bound to the wrong page would still compile (POPS-3256).
 */
describe('food page tree', () => {
  it('describes the route tree the app mounts', () => {
    expect(pageTreeMismatches(FOOD_PAGES, routes, PAGE_COMPONENTS)).toEqual([]);
  });
});
