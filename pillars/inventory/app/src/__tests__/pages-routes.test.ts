import { describe, expect, it } from 'vitest';

import { INVENTORY_PAGES } from '@pops/inventory/manifest';
import { pageTreeMismatches } from '@pops/pillar-sdk/testing';

import { PAGE_COMPONENTS, routes } from '../routes';

import type { PageDescriptor } from '@pops/pillar-sdk/manifest-schema';

function deepestPageDepth(pages: readonly PageDescriptor[], depth = 1): number {
  return pages.reduce((deepest, page) => {
    const pageDepth =
      page.children === undefined || page.children.length === 0
        ? depth
        : deepestPageDepth(page.children, depth + 1);
    return Math.max(deepest, pageDepth);
  }, depth);
}

/**
 * The shell mounts this pillar from `INVENTORY_PAGES`; the app's own `routes`
 * table is kept beside it by hand. `satisfies` in `routes.tsx` pins the slot
 * set, not the tree, so a tab nested differently, a path spelled differently
 * or a slot bound to the wrong page would still compile (POPS-3256).
 */
describe('inventory page tree', () => {
  it('every page sits under the inventory-layout node', () => {
    expect(pageTreeMismatches(INVENTORY_PAGES, routes, PAGE_COMPONENTS)).toEqual([]);
    expect(INVENTORY_PAGES).toHaveLength(1);
    expect(INVENTORY_PAGES[0]?.bundleSlot).toBe('inventory-layout');
    expect(INVENTORY_PAGES[0]?.children).toHaveLength(27);
  });

  it("stays within the manifest's three-level page depth", () => {
    expect(deepestPageDepth(INVENTORY_PAGES)).toBeLessThanOrEqual(3);
  });

  it('keeps the layout path-less and the overview as its index child', () => {
    expect(INVENTORY_PAGES[0]).toMatchObject({
      path: '',
      bundleSlot: 'inventory-layout',
    });
    expect(INVENTORY_PAGES[0]?.children?.[0]).toEqual({
      path: '',
      index: true,
      bundleSlot: 'inventory-overview',
    });
  });
});
