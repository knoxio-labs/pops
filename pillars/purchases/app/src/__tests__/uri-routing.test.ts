import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { resolveUri } from '@pops/navigation';

import { navConfig, routes } from '../index';

import type { RouteObject } from 'react-router';

/**
 * A purchases search hit has to survive two hops to be worth rendering: the
 * shell's `URI_ROUTE_MAP` has to turn its URI into a path, and this app has to
 * mount a route that path matches. Both were missing, so a hit rendered and
 * then did nothing when clicked.
 *
 * The URI shapes below are the ones `pillars/purchases/src/db/services/search.ts`
 * emits. That pillar asserts separately that it emits nothing its manifest does
 * not declare; this asserts the other end, which is the only end that can see
 * the route table.
 */
function routeFor(uri: string, data: Record<string, unknown> = {}): string | null {
  const resolved = resolveUri(uri, data);
  if (resolved === null) return null;

  const [pathname = ''] = resolved.split('?');
  return matchedRoutePath(pathname);
}

/** The path pattern of the deepest route the app mounts for `pathname`. */
function matchedRoutePath(pathname: string): string | null {
  const mounted: RouteObject[] = [{ path: navConfig.basePath, children: routes }];
  const leaf = matchRoutes(mounted, pathname)?.at(-1);
  if (leaf === undefined) return null;
  return leaf.route.path ?? (leaf.route.index === true ? '' : null);
}

describe('a purchases URI lands on a route this app mounts', () => {
  it('opens an order hit on the order detail route', () => {
    expect(routeFor('pops:purchases/purchase/order-1')).toBe(':purchaseId');
  });

  it('opens a line hit on the order it was bought on', () => {
    expect(resolveUri('pops:purchases/purchase-item/line-9', { purchaseId: 'order-1' })).toBe(
      '/purchases/order-1?item=line-9'
    );
    expect(routeFor('pops:purchases/purchase-item/line-9', { purchaseId: 'order-1' })).toBe(
      ':purchaseId'
    );
  });

  // The router cannot know an id is stale, and it must not try: an id nothing
  // holds still belongs to the detail route, which is the surface that can say
  // the order is gone. Resolving it to nothing would strand the reader on the
  // page they clicked from with no explanation at all.
  it('routes an order that does not exist to the page that can say so', () => {
    expect(routeFor('pops:purchases/purchase/order-that-never-was')).toBe(':purchaseId');
  });

  it('does not route a line hit that lost its order', () => {
    expect(routeFor('pops:purchases/purchase-item/line-9')).toBeNull();
  });
});

describe('the detail route does not swallow the pillar’s own pages', () => {
  // `:purchaseId` sits beside two static siblings, and an order whose id spelt
  // `merchants` would be indistinguishable from the merchant lens if ranking
  // went the other way.
  it.each(navConfig.items.map((item) => item.path))('keeps %s on its own route', (navPath) => {
    expect(matchedRoutePath(`${navConfig.basePath}${navPath}`)).not.toBe(':purchaseId');
  });
});
