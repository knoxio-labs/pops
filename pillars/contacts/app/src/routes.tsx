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
const EntityPage = lazy(() =>
  import('./pages/EntityPage').then((module) => ({ default: module.EntityPage }))
);
const CreateContactPage = lazy(() =>
  import('./pages/CreateContactPage').then((module) => ({ default: module.CreateContactPage }))
);
const DuplicatesPage = lazy(() =>
  import('./pages/DuplicatesPage').then((module) => ({ default: module.DuplicatesPage }))
);
const ContactReferencePage = lazy(() =>
  import('./pages/ContactReferencePage').then((module) => ({
    default: module.ContactReferencePage,
  }))
);

/** Contacts-owned routes for imports, connection setup, entity details and duplicate review. */
export const routes: RouteObject[] = [
  { index: true, element: <ImportReviewPage /> },
  { path: 'imports/:batchId', element: <ImportReviewPage /> },
  { path: 'connections', element: <ConnectionsPage /> },
  { path: 'people/:personId', element: <PersonPage /> },
  { path: 'new', element: <CreateContactPage /> },
  { path: 'duplicates', element: <DuplicatesPage /> },
  { path: 'entities/:entityId', element: <EntityPage /> },
  { path: ':entityId', element: <ContactReferencePage /> },
];
/** Remote component slots consumed by the shell registry loader. */
export const bundles = {
  'contacts-import-review': ImportReviewPage,
  'contacts-connections': ConnectionsPage,
  'contacts-person': PersonPage,
  'contacts-entity': EntityPage,
  'contacts-create': CreateContactPage,
  'contacts-duplicates': DuplicatesPage,
  'contacts-reference': ContactReferencePage,
};
