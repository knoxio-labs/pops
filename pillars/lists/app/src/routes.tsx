import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const ListsIndexPage = lazy(() =>
  import('./pages/ListsIndexPage').then((m) => ({ default: m.ListsIndexPage }))
);

const ListDetailPage = lazy(() =>
  import('./pages/ListDetailPage').then((m) => ({ default: m.ListDetailPage }))
);

export { navConfig } from './nav';

export const routes: RouteObject[] = [
  { index: true, element: <ListsIndexPage /> },
  { path: ':id', element: <ListDetailPage /> },
];
