/**
 * Cerebrum app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-cerebrum and mounts them under /cerebrum/*.
 */
import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { CerebrumPageSlot } from '@pops/cerebrum/manifest';

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

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `CEREBRUM_PAGES` with nothing to render fails
 * to compile here, and a component bound to a slot the contract does not
 * declare fails the same way. The capture overlay is NOT here — it is not a
 * page, and `bundles` adds it alongside these.
 */
export const PAGE_COMPONENTS = {
  'cerebrum-ingest': IngestPage,
  'cerebrum-chat': ChatPage,
  'cerebrum-nudges': NudgesPage,
  'cerebrum-proposals': ProposalQueuePage,
  'cerebrum-engrams': EngramsListPage,
  'cerebrum-engram-detail': EngramDetailPage,
  'cerebrum-documents': DocumentsPage,
  'cerebrum-query': QueryPage,
  'cerebrum-reflex': ReflexListPage,
  'cerebrum-reflex-detail': ReflexDetailPage,
  'cerebrum-plexus': PlexusListPage,
  'cerebrum-plexus-detail': PlexusDetailPage,
  'cerebrum-glia': GliaDashboardPage,
} satisfies Record<CerebrumPageSlot, ComponentType>;

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
