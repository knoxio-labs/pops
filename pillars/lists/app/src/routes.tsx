import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { ListsPageSlot } from '@pops/lists/manifest';

const ListsIndexPage = lazy(() =>
  import('./pages/ListsIndexPage').then((m) => ({ default: m.ListsIndexPage }))
);

const ListDetailPage = lazy(() =>
  import('./pages/ListDetailPage').then((m) => ({ default: m.ListDetailPage }))
);

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `LISTS_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. `bundles` is this map under the name the wire uses.
 */
export const PAGE_COMPONENTS = {
  'lists-index': ListsIndexPage,
  'lists-detail': ListDetailPage,
} satisfies Record<ListsPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <ListsIndexPage /> },
  { path: ':id', element: <ListDetailPage /> },
];
