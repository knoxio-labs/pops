/**
 * Inventory app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-inventory and mounts them under /inventory/*.
 */
import { lazy } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { InventoryPageSlot } from '@pops/inventory/manifest';

const ItemsPage = lazy(() => import('./pages/ItemsPage').then((m) => ({ default: m.ItemsPage })));
const ItemDetailPage = lazy(() =>
  import('./pages/ItemDetailPage').then((m) => ({
    default: m.ItemDetailPage,
  }))
);
const ItemFormPage = lazy(() =>
  import('./pages/ItemFormPage').then((m) => ({ default: m.ItemFormPage }))
);
const WarrantiesPage = lazy(() =>
  import('./pages/WarrantiesPage').then((m) => ({
    default: m.WarrantiesPage,
  }))
);
const ReportDashboardPage = lazy(() =>
  import('./pages/ReportDashboardPage').then((m) => ({
    default: m.ReportDashboardPage,
  }))
);
const InsuranceReportPage = lazy(() =>
  import('./pages/InsuranceReportPage').then((m) => ({
    default: m.InsuranceReportPage,
  }))
);
const LocationTreePage = lazy(() =>
  import('./pages/LocationTreePage').then((m) => ({
    default: m.LocationTreePage,
  }))
);
const ConnectionsPage = lazy(() =>
  import('./pages/ConnectionsPage').then((m) => ({
    default: m.ConnectionsPage,
  }))
);

/** Redirects the old singular path to the plural equivalent, preserving query string. */
export function SearchPreservingRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/**
 * The `reports` group has no element of its own in react-router's terms — a
 * route may carry children and no element, and this one did. The wire needs a
 * slot per node, so the group names a passthrough rendering exactly what
 * react-router renders implicitly. Both mount paths use this component, so
 * they cannot drift apart.
 */
const ReportsGroup = () => <Outlet />;

/** Bound as components because the loader resolves a slot to a `ComponentType`. */
const ReportRedirect = () => <SearchPreservingRedirect to="/inventory/reports" />;
const InsuranceReportRedirect = () => (
  <SearchPreservingRedirect to="/inventory/reports/insurance" />
);

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it — the nested report pages included.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `INVENTORY_PAGES` with nothing to render fails
 * to compile here, and a component bound to a slot the contract does not
 * declare fails the same way. Two paths may share a slot —
 * `items/new` and `items/:id/edit` are one form — because a slot names a
 * component, not a URL.
 */
export const PAGE_COMPONENTS = {
  'inventory-items': ItemsPage,
  'inventory-item-form': ItemFormPage,
  'inventory-item-detail': ItemDetailPage,
  'inventory-connections': ConnectionsPage,
  'inventory-warranties': WarrantiesPage,
  'inventory-location-tree': LocationTreePage,
  'inventory-reports-group': ReportsGroup,
  'inventory-report-dashboard': ReportDashboardPage,
  'inventory-insurance-report': InsuranceReportPage,
  'inventory-report-redirect': ReportRedirect,
  'inventory-insurance-report-redirect': InsuranceReportRedirect,
} satisfies Record<InventoryPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <ItemsPage /> },
  { path: 'items/new', element: <ItemFormPage /> },
  { path: 'items/:id', element: <ItemDetailPage /> },
  { path: 'items/:id/edit', element: <ItemFormPage /> },
  { path: 'connections', element: <ConnectionsPage /> },
  { path: 'warranties', element: <WarrantiesPage /> },
  { path: 'locations', element: <LocationTreePage /> },
  {
    path: 'reports',
    element: <ReportsGroup />,
    children: [
      { index: true, element: <ReportDashboardPage /> },
      { path: 'insurance', element: <InsuranceReportPage /> },
    ],
  },
  { path: 'report', element: <ReportRedirect /> },
  { path: 'report/insurance', element: <InsuranceReportRedirect /> },
];
