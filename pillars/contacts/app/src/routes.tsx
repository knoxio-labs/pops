import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const ImportReviewPage = lazy(() =>
  import('./pages/ImportReviewPage').then((module) => ({ default: module.ImportReviewPage }))
);
const ConnectionsPage = lazy(() =>
  import('./pages/ConnectionsPage').then((module) => ({ default: module.ConnectionsPage }))
);

/** Routes for the contacts import review surface advertised by the Rust manifest. */
export const routes: RouteObject[] = [
  { index: true, element: <ImportReviewPage /> },
  { path: 'imports/:batchId', element: <ImportReviewPage /> },
  { path: 'connections', element: <ConnectionsPage /> },
];
/** Remote component slots consumed by the shell registry loader. */
export const bundles = {
  'contacts-import-review': ImportReviewPage,
  'contacts-connections': ConnectionsPage,
};
