import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { INVENTORY_NAV } from '@pops/inventory/manifest';

import { GLOBAL_DESTINATIONS } from '../layout/global-shortcuts';
import { navConfig } from '../nav';
import { inventoryRoutePath } from '../navigation-paths';
import { routes } from '../routes';

function expectMountedRoute(href: string): void {
  const matches = matchRoutes(routes, inventoryRoutePath(href));
  expect(matches, href).not.toBeNull();
}

describe('inventory navigation targets', () => {
  it('mounts every PageNav item in the route table', () => {
    expect(navConfig.items).toHaveLength(INVENTORY_NAV.items.length);

    for (const item of navConfig.items) {
      expectMountedRoute(`${navConfig.basePath}${item.path}`);
    }
  });

  it('mounts every global shortcut destination in the route table', () => {
    for (const destination of Object.values(GLOBAL_DESTINATIONS)) {
      expectMountedRoute(destination);
    }
  });

  it('rejects paths outside the inventory mount', () => {
    expect(() => inventoryRoutePath('/purchases')).toThrow('Not an inventory path');
  });
});
