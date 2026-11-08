import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const ImportReviewPage = lazy(() =>
  import('./pages/ImportReviewPage').then((module) => ({ default: module.ImportReviewPage }))
);
const ConnectionsPage = lazy(() =>
  import('./pages/ConnectionsPage').then((module) => ({ default: module.ConnectionsPage }))
);

const PersonPage = lazy(() =>
  import('./pages/PersonPage').then((module) => ({ default: module.PersonPage }))
);

/** Routes for Contacts-owned import review, connections and person details. */
export const routes: RouteObject[] = [
  { index: true, element: <ImportReviewPage /> },
  { path: 'imports/:batchId', element: <ImportReviewPage /> },
  { path: 'connections', element: <ConnectionsPage /> },
  { path: 'people/:personId', element: <PersonPage /> },
];
/** Remote component slots consumed by the shell registry loader. */
export const bundles = {
  'contacts-import-review': ImportReviewPage,
  'contacts-connections': ConnectionsPage,
  'contacts-person': PersonPage,
};
