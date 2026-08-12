/**
 * purchases app route definitions and navigation config.
 *
 * Routes are lazy-loaded for code splitting. The shell imports these via
 * `@pops/app-purchases` and mounts them under `/purchases/*`.
 *
 * The pillar serves more than these surfaces render, but a nav item or a page
 * descriptor without a route behind it is the dead link this pillar's manifest
 * spent its whole life avoiding — each further view arrives with its route.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const ReconcileQueuePage = lazy(() =>
  import('./pages/ReconcileQueuePage').then((m) => ({ default: m.ReconcileQueuePage }))
);

const MerchantLensPage = lazy(() =>
  import('./pages/MerchantLensPage').then((m) => ({ default: m.MerchantLensPage }))
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'purchases',
  icon: 'Receipt',
  color: 'rose',
  basePath: '/purchases',
  items: [
    { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'Receipt' },
    {
      path: 'merchants',
      label: 'Merchants',
      labelKey: 'purchases.merchants',
      icon: 'Building2',
    },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ReconcileQueuePage /> },
  { path: 'merchants', element: <MerchantLensPage /> },
];
