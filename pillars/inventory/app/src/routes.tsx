/** Inventory route definitions and the runtime-loader page bundle map. */
import { lazy } from 'react';
import { Navigate, useLocation } from 'react-router';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { InventoryPageSlot } from '@pops/inventory/manifest';

const OverviewPage = lazy(() =>
  import('./pages/overview/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const ItemsPage = lazy(() => import('./pages/ItemsPage').then((m) => ({ default: m.ItemsPage })));
const ItemFormPage = lazy(() =>
  import('./pages/ItemFormPage').then((m) => ({ default: m.ItemFormPage }))
);
const BulkEntryPage = lazy(() =>
  import('./pages/bulk-new/BulkEntryPage').then((m) => ({ default: m.BulkEntryPage }))
);
const ItemDetailPage = lazy(() =>
  import('./pages/ItemDetailPage').then((m) => ({ default: m.ItemDetailPage }))
);
const ItemHistoryPage = lazy(() =>
  import('./pages/item-history/ItemHistoryPage').then((m) => ({ default: m.ItemHistoryPage }))
);
const ContainersPage = lazy(() =>
  import('./pages/containers/ContainersPage').then((m) => ({ default: m.ContainersPage }))
);
const MovingDayPage = lazy(() =>
  import('./pages/moving-day/MovingDayPage').then((m) => ({ default: m.MovingDayPage }))
);
const InHandPage = lazy(() =>
  import('./pages/in-hand/InHandPage').then((m) => ({ default: m.InHandPage }))
);
const LocationTreePage = lazy(() =>
  import('./pages/LocationTreePage').then((m) => ({ default: m.LocationTreePage }))
);
const LocationPage = lazy(() =>
  import('./pages/location-page/LocationPage').then((m) => ({ default: m.LocationPage }))
);
const SearchPage = lazy(() =>
  import('./pages/search/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const ConnectionsPage = lazy(() =>
  import('./pages/ConnectionsPage').then((m) => ({ default: m.ConnectionsPage }))
);
const FixturesPage = lazy(() =>
  import('./pages/fixtures/FixturesPage').then((m) => ({ default: m.FixturesPage }))
);
const FixtureDetailPage = lazy(() =>
  import('./pages/fixtures/FixtureDetailPage').then((m) => ({ default: m.FixtureDetailPage }))
);
const TypeCataloguePage = lazy(() =>
  import('./pages/TypeCataloguePage').then((m) => ({ default: m.TypeCataloguePage }))
);
const TypeArrivedPage = lazy(() =>
  import('./pages/type-arrived/TypeArrivedPage').then((m) => ({ default: m.TypeArrivedPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const LabelsPage = lazy(() =>
  import('./pages/labels-page/LabelsPage').then((m) => ({ default: m.LabelsPage }))
);
const SyncPage = lazy(() => import('./pages/sync/SyncPage').then((m) => ({ default: m.SyncPage })));
const ImportPage = lazy(() =>
  import('./pages/import/ImportPage').then((m) => ({ default: m.ImportPage }))
);

function redirectSearch(search: string, set: Readonly<Record<string, string>> | undefined): string {
  const redirectParams = new URLSearchParams();
  const replacedKeys = new Set<string>();

  for (const [key, value] of Object.entries(set ?? {})) {
    redirectParams.append(key, value);
    replacedKeys.add(key);
  }

  for (const [key, value] of new URLSearchParams(search)) {
    if (!replacedKeys.has(key)) redirectParams.append(key, value);
  }

  const query = redirectParams.toString();
  return query === '' ? '' : `?${query}`;
}

/** Redirects an inventory bookmark while applying fixed query parameters first. */
export function SearchPreservingRedirect({
  to,
  set,
}: {
  to: string;
  set?: Readonly<Record<string, string>>;
}) {
  const { search } = useLocation();
  return <Navigate to={`${to}${redirectSearch(search, set)}`} replace />;
}

const ReportRedirect = () => <SearchPreservingRedirect to="/inventory/reports" />;
const InsuranceReportRedirect = () => (
  <SearchPreservingRedirect to="/inventory/reports" set={{ tab: 'insurance' }} />
);
const WarrantiesRedirect = () => (
  <SearchPreservingRedirect to="/inventory/reports" set={{ tab: 'warranties' }} />
);
const ActivityRedirect = () => (
  <SearchPreservingRedirect to="/inventory/sync" set={{ segment: 'activity' }} />
);

export { navConfig } from './nav';

/** Resolves every manifest page slot to the component mounted by that route. */
export const PAGE_COMPONENTS = {
  'inventory-overview': OverviewPage,
  'inventory-items': ItemsPage,
  'inventory-item-form': ItemFormPage,
  'inventory-bulk-entry': BulkEntryPage,
  'inventory-item-detail': ItemDetailPage,
  'inventory-item-history': ItemHistoryPage,
  'inventory-containers': ContainersPage,
  'inventory-moving-day': MovingDayPage,
  'inventory-in-hand': InHandPage,
  'inventory-location-tree': LocationTreePage,
  'inventory-location': LocationPage,
  'inventory-search': SearchPage,
  'inventory-connections': ConnectionsPage,
  'inventory-fixtures': FixturesPage,
  'inventory-fixture': FixtureDetailPage,
  'inventory-type-catalogue': TypeCataloguePage,
  'inventory-type-arrived': TypeArrivedPage,
  'inventory-reports': ReportsPage,
  'inventory-labels': LabelsPage,
  'inventory-sync': SyncPage,
  'inventory-import': ImportPage,
  'inventory-warranties-redirect': WarrantiesRedirect,
  'inventory-activity-redirect': ActivityRedirect,
  'inventory-insurance-report-redirect': InsuranceReportRedirect,
  'inventory-report-redirect': ReportRedirect,
} satisfies Record<InventoryPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },
  { path: 'items', element: <ItemsPage /> },
  { path: 'items/new', element: <ItemFormPage /> },
  { path: 'items/bulk-new', element: <BulkEntryPage /> },
  { path: 'items/:id', element: <ItemDetailPage /> },
  { path: 'items/:id/edit', element: <ItemFormPage /> },
  { path: 'items/:id/history', element: <ItemHistoryPage /> },
  { path: 'containers', element: <ContainersPage /> },
  { path: 'moving-day', element: <MovingDayPage /> },
  { path: 'in-hand', element: <InHandPage /> },
  { path: 'locations', element: <LocationTreePage /> },
  { path: 'locations/:id', element: <LocationPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'connections', element: <ConnectionsPage /> },
  { path: 'connections/fixtures', element: <FixturesPage /> },
  { path: 'fixtures/:id', element: <FixtureDetailPage /> },
  { path: 'types', element: <TypeCataloguePage /> },
  { path: 'types/:id/arrived', element: <TypeArrivedPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'labels', element: <LabelsPage /> },
  { path: 'sync', element: <SyncPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'warranties', element: <WarrantiesRedirect /> },
  { path: 'activity', element: <ActivityRedirect /> },
  { path: 'reports/insurance', element: <InsuranceReportRedirect /> },
  { path: 'report', element: <ReportRedirect /> },
  { path: 'report/insurance', element: <InsuranceReportRedirect /> },
];
