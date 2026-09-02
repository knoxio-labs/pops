/**
 * Inventory app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-inventory and mounts them under /inventory/*.
 */
import { lazy } from 'react';
import { Navigate, useLocation } from 'react-router';

import type { RouteObject } from 'react-router';

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

export { navConfig } from './nav';

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
    children: [
      { index: true, element: <ReportDashboardPage /> },
      { path: 'insurance', element: <InsuranceReportPage /> },
    ],
  },
  { path: 'report', element: <SearchPreservingRedirect to="/inventory/reports" /> },
  {
    path: 'report/insurance',
    element: <SearchPreservingRedirect to="/inventory/reports/insurance" />,
  },
];
