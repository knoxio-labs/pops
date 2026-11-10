import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { TripsPageSlot } from '@pops/trips/pages';

const HomePage = lazy(() =>
  import('./home/HomePage').then((module) => ({ default: module.HomePage }))
);
const StayPage = lazy(() => import('./StayPage').then((module) => ({ default: module.StayPage })));
const EventPage = lazy(() =>
  import('./EventPage').then((module) => ({ default: module.EventPage }))
);
const DecisionPage = lazy(() =>
  import('./DecisionPage').then((module) => ({ default: module.DecisionPage }))
);
const JourneyPage = lazy(() =>
  import('./JourneyPage').then((module) => ({ default: module.JourneyPage }))
);
const PeoplePage = lazy(() =>
  import('./PeoplePage').then((module) => ({ default: module.PeoplePage }))
);
const SettingsPage = lazy(() =>
  import('./settings/TripSettingsPage').then((module) => ({ default: module.TripSettingsPage }))
);
/** Implemented source-backed slots resolved by the shell's registry-driven remote loader. */
export const bundles = {
  'trips-home': HomePage,
  'trips-stay': StayPage,
  'trips-event': EventPage,
  'trips-decision': DecisionPage,
  'trips-journey': JourneyPage,
  'trips-settings': SettingsPage,
  'trips-people': PeoplePage,
} satisfies Record<TripsPageSlot, ComponentType>;
/** Local route projection used only by component hosts and development integration. */
export const routes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: ':tripId/stays/:stayId', element: <StayPage /> },
  { path: ':tripId/events/:eventId', element: <EventPage /> },
  { path: ':tripId/decisions/:decisionId', element: <DecisionPage /> },
  { path: ':tripId/journeys/:journeyId', element: <JourneyPage /> },
  { path: ':tripId/settings', element: <SettingsPage /> },
  { path: ':tripId/people', element: <PeoplePage /> },
];
