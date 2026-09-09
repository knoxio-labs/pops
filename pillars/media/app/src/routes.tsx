/**
 * Media app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-media and mounts them under /media/*.
 */
import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { MediaPageSlot } from '@pops/media/manifest';

const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const MovieDetailPage = lazy(() =>
  import('./pages/MovieDetailPage').then((m) => ({
    default: m.MovieDetailPage,
  }))
);
const TvShowDetailPage = lazy(() =>
  import('./pages/TvShowDetailPage').then((m) => ({
    default: m.TvShowDetailPage,
  }))
);
const SeasonDetailPage = lazy(() =>
  import('./pages/SeasonDetailPage').then((m) => ({
    default: m.SeasonDetailPage,
  }))
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const WatchlistPage = lazy(() =>
  import('./pages/WatchlistPage').then((m) => ({
    default: m.WatchlistPage,
  }))
);
const QuickPickPage = lazy(() =>
  import('./pages/QuickPickPage').then((m) => ({
    default: m.QuickPickPage,
  }))
);
const CompareArenaPage = lazy(() =>
  import('./pages/CompareArenaPage').then((m) => ({
    default: m.CompareArenaPage,
  }))
);
const DiscoverPage = lazy(() =>
  import('./pages/DiscoverPage').then((m) => ({
    default: m.DiscoverPage,
  }))
);
const RankingsPage = lazy(() =>
  import('./pages/RankingsPage').then((m) => ({
    default: m.RankingsPage,
  }))
);
const RotationLogPage = lazy(() =>
  import('./pages/RotationLogPage').then((m) => ({
    default: m.RotationLogPage,
  }))
);
const CandidateQueuePage = lazy(() =>
  import('./pages/CandidateQueuePage').then((m) => ({
    default: m.CandidateQueuePage,
  }))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  }))
);
const ComparisonHistoryPage = lazy(() =>
  import('./pages/ComparisonHistoryPage').then((m) => ({
    default: m.ComparisonHistoryPage,
  }))
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({
    default: m.CalendarPage,
  }))
);
const TierListPage = lazy(() =>
  import('./pages/TierListPage').then((m) => ({
    default: m.TierListPage,
  }))
);

export { navConfig } from './nav';

/**
 * The four redirects are components rather than inline elements: the loader
 * resolves a page slot to a `ComponentType` and renders it itself, so an
 * element built once at module scope would never see the router it is
 * mounted under.
 */
const PlexRedirect = () => <Navigate to="/settings#media.plex" replace />;
const ArrRedirect = () => <Navigate to="/settings#media.arr" replace />;
const RotationRedirect = () => <Navigate to="/settings#media.rotation" replace />;
const CalendarRedirect = () => <Navigate to="/media/discover" replace />;

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `MEDIA_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. The two settings widgets are NOT here — they are not
 * pages, and `bundles` adds them alongside these.
 */
export const PAGE_COMPONENTS = {
  'media-library': LibraryPage,
  'media-movie-detail': MovieDetailPage,
  'media-tv-detail': TvShowDetailPage,
  'media-season-detail': SeasonDetailPage,
  'media-watchlist': WatchlistPage,
  'media-history': HistoryPage,
  'media-discover': DiscoverPage,
  'media-rankings': RankingsPage,
  'media-search': SearchPage,
  'media-compare': CompareArenaPage,
  'media-comparison-history': ComparisonHistoryPage,
  'media-quick-pick': QuickPickPage,
  'media-rotation-log': RotationLogPage,
  'media-candidate-queue': CandidateQueuePage,
  'media-calendar': CalendarPage,
  'media-tier-list': TierListPage,
  'media-plex-redirect': PlexRedirect,
  'media-arr-redirect': ArrRedirect,
  'media-rotation-redirect': RotationRedirect,
  'media-calendar-redirect': CalendarRedirect,
} satisfies Record<MediaPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: 'movies/:id', element: <MovieDetailPage /> },
  { path: 'tv/:id', element: <TvShowDetailPage /> },
  { path: 'tv/:id/season/:num', element: <SeasonDetailPage /> },
  { path: 'watchlist', element: <WatchlistPage /> },
  { path: 'history', element: <HistoryPage /> },
  { path: 'discover', element: <DiscoverPage /> },
  { path: 'rankings', element: <RankingsPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'compare', element: <CompareArenaPage /> },
  { path: 'compare/history', element: <ComparisonHistoryPage /> },
  { path: 'quick-pick', element: <QuickPickPage /> },
  { path: 'plex', element: <PlexRedirect /> },
  { path: 'arr', element: <ArrRedirect /> },
  { path: 'rotation', element: <RotationRedirect /> },
  { path: 'rotation/log', element: <RotationLogPage /> },
  { path: 'rotation/candidates', element: <CandidateQueuePage /> },
  { path: 'arr/calendar', element: <CalendarPage /> },
  { path: 'calendar', element: <CalendarRedirect /> },
  { path: 'tier-list', element: <TierListPage /> },
];
