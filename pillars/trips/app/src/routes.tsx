import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { TripsPageSlot } from '@pops/trips/pages';

const HomePage = lazy(() =>
  import('./home/HomePage').then((module) => ({ default: module.HomePage }))
);
const VisitPage = lazy(() =>
  import('./VisitPage').then((module) => ({ default: module.VisitPage }))
);
const CalendarPage = lazy(() =>
  import('./TripOverviewPage').then((module) => ({ default: module.TripCalendarPage }))
);
const StayPage = lazy(() => import('./StayPage').then((module) => ({ default: module.StayPage })));
const TripOverviewPage = lazy(() =>
  import('./TripOverviewPage').then((module) => ({ default: module.TripOverviewPage }))
);
const EventPage = lazy(() =>
  import('./EventPage').then((module) => ({ default: module.EventPage }))
);
const DecisionPage = lazy(() =>
  import('./DecisionPage').then((module) => ({ default: module.DecisionPage }))
);
const JourneyPage = lazy(() =>
  import('./JourneyPage').then((module) => ({ default: module.JourneyPage }))
);
const DocumentsPage = lazy(() =>
  import('./DocumentsPage').then((module) => ({ default: module.DocumentsPage }))
);
const SettingsPage = lazy(() =>
  import('./settings/TripSettingsPage').then((module) => ({ default: module.TripSettingsPage }))
);
/** Implemented source-backed slots resolved by the shell's registry-driven remote loader. */
export const bundles = {
  'trips-home': HomePage,
  'trips-overview': TripOverviewPage,
  'trips-calendar': CalendarPage,
  'trips-stay': StayPage,
  'trips-arrangements': TripOverviewPage,
  'trips-event': EventPage,
  'trips-decision': DecisionPage,
  'trips-visit': VisitPage,
  'trips-journey': JourneyPage,
  'trips-documents': DocumentsPage,
  'trips-settings': SettingsPage,
} satisfies Record<TripsPageSlot, ComponentType>;
/** Local route projection used only by component hosts and development integration. */
export const routes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: ':tripId', element: <TripOverviewPage /> },
  { path: ':tripId/visits/:visitId', element: <VisitPage /> },
  { path: ':tripId/calendar', element: <CalendarPage /> },
  { path: ':tripId/stays/:stayId', element: <StayPage /> },
  { path: ':tripId/arrangements', element: <TripOverviewPage /> },
  { path: ':tripId/events/:eventId', element: <EventPage /> },
  { path: ':tripId/decisions/:decisionId', element: <DecisionPage /> },
  { path: ':tripId/journeys/:journeyId', element: <JourneyPage /> },
  { path: ':tripId/documents', element: <DocumentsPage /> },
  { path: ':tripId/settings', element: <SettingsPage /> },
];
