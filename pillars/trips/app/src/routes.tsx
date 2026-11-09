import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { TripsPageSlot } from '@pops/trips/pages';

const HomePage = lazy(() =>
  import('./home/HomePage').then((module) => ({ default: module.HomePage }))
);
const StayPage = lazy(() => import('./StayPage').then((module) => ({ default: module.StayPage })));
const DecisionPage = lazy(() =>
  import('./DecisionPage').then((module) => ({ default: module.DecisionPage }))
);
const SettingsPage = lazy(() =>
  import('./settings/TripSettingsPage').then((module) => ({ default: module.TripSettingsPage }))
);
/** Implemented source-backed slots resolved by the shell's registry-driven remote loader. */
export const bundles = {
  'trips-home': HomePage,
  'trips-stay': StayPage,
  'trips-decision': DecisionPage,
  'trips-settings': SettingsPage,
} satisfies Record<TripsPageSlot, ComponentType>;
/** Local route projection used only by component hosts and development integration. */
export const routes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: ':tripId/stays/:stayId', element: <StayPage /> },
  { path: ':tripId/decisions/:decisionId', element: <DecisionPage /> },
  { path: ':tripId/settings', element: <SettingsPage /> },
];
