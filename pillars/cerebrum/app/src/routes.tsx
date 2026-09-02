/**
 * Cerebrum app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-cerebrum and mounts them under /cerebrum/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const IngestPage = lazy(() =>
  import('./pages/IngestPage').then((m) => ({ default: m.IngestPage }))
);
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const NudgesPage = lazy(() =>
  import('./pages/NudgesPage').then((m) => ({ default: m.NudgesPage }))
);
const ProposalQueuePage = lazy(() =>
  import('./pages/ProposalQueuePage').then((m) => ({ default: m.ProposalQueuePage }))
);
const EngramsListPage = lazy(() =>
  import('./pages/EngramsListPage').then((m) => ({ default: m.EngramsListPage }))
);
const EngramDetailPage = lazy(() =>
  import('./pages/EngramDetailPage').then((m) => ({ default: m.EngramDetailPage }))
);
const ReflexListPage = lazy(() =>
  import('./pages/ReflexListPage').then((m) => ({ default: m.ReflexListPage }))
);
const ReflexDetailPage = lazy(() =>
  import('./pages/ReflexDetailPage').then((m) => ({ default: m.ReflexDetailPage }))
);
const PlexusListPage = lazy(() =>
  import('./pages/PlexusListPage').then((m) => ({ default: m.PlexusListPage }))
);
const PlexusDetailPage = lazy(() =>
  import('./pages/PlexusDetailPage').then((m) => ({ default: m.PlexusDetailPage }))
);
const GliaDashboardPage = lazy(() =>
  import('./pages/GliaDashboardPage').then((m) => ({ default: m.GliaDashboardPage }))
);
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage }))
);
const QueryPage = lazy(() => import('./pages/QueryPage').then((m) => ({ default: m.QueryPage })));

export { navConfig } from './nav';

export const routes: RouteObject[] = [
  { index: true, element: <IngestPage /> },
  { path: 'chat', element: <ChatPage /> },
  { path: 'nudges', element: <NudgesPage /> },
  { path: 'proposals', element: <ProposalQueuePage /> },
  { path: 'engrams', element: <EngramsListPage /> },
  { path: 'engrams/:id', element: <EngramDetailPage /> },
  { path: 'documents', element: <DocumentsPage /> },
  { path: 'query', element: <QueryPage /> },
  { path: 'reflex', element: <ReflexListPage /> },
  { path: 'reflex/:name', element: <ReflexDetailPage /> },
  { path: 'plexus', element: <PlexusListPage /> },
  { path: 'plexus/:adapterId', element: <PlexusDetailPage /> },
  { path: 'glia', element: <GliaDashboardPage /> },
];
