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
  import('./CalendarPage').then((module) => ({ default: module.CalendarPage }))
);
const StayPage = lazy(() => import('./StayPage').then((module) => ({ default: module.StayPage })));
const ArrangementsPage = lazy(() =>
  import('./ArrangementsPage').then((module) => ({ default: module.ArrangementsPage }))
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
const CapturePage = lazy(() =>
  import('./CapturePage').then((module) => ({ default: module.CaptureHomePage }))
);
const InboxPage = lazy(() =>
  import('./CapturePage').then((module) => ({ default: module.InboxPage }))
);
const ExplorePage = lazy(() =>
  import('./CapturePage').then((module) => ({ default: module.ExplorePage }))
);
const SettingsPage = lazy(() =>
  import('./settings/TripSettingsPage').then((module) => ({ default: module.TripSettingsPage }))
);
/** Implemented source-backed slots resolved by the shell's registry-driven remote loader. */
export const bundles = {
  'trips-home': HomePage,
  'trips-calendar': CalendarPage,
  'trips-stay': StayPage,
  'trips-arrangements': ArrangementsPage,
  'trips-event': EventPage,
  'trips-decision': DecisionPage,
  'trips-visit': VisitPage,
  'trips-journey': JourneyPage,
  'trips-documents': DocumentsPage,
  'trips-capture': CapturePage,
  'trips-inbox': InboxPage,
  'trips-explore': ExplorePage,
  'trips-settings': SettingsPage,
} satisfies Record<TripsPageSlot, ComponentType>;
/** Local route projection used only by component hosts and development integration. */
export const routes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: ':tripId/visits/:visitId', element: <VisitPage /> },
  { path: ':tripId/calendar', element: <CalendarPage /> },
  { path: ':tripId/stays/:stayId', element: <StayPage /> },
  { path: ':tripId/arrangements', element: <ArrangementsPage /> },
  { path: ':tripId/events/:eventId', element: <EventPage /> },
  { path: ':tripId/decisions/:decisionId', element: <DecisionPage /> },
  { path: ':tripId/journeys/:journeyId', element: <JourneyPage /> },
  { path: ':tripId/documents', element: <DocumentsPage /> },
  { path: ':tripId/capture', element: <CapturePage /> },
  { path: ':tripId/inbox', element: <InboxPage /> },
  { path: ':tripId/explore', element: <ExplorePage /> },
  { path: ':tripId/settings', element: <SettingsPage /> },
];
