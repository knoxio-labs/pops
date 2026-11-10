/** Shell routes and remote bundle slots shared by Trips registration and its UI. */
export const TRIPS_PAGES = [
  { path: '', index: true, bundleSlot: 'trips-home' },
  { path: ':tripId/visits/:visitId', bundleSlot: 'trips-visit' },
  { path: ':tripId/calendar', bundleSlot: 'trips-calendar' },
  { path: ':tripId/stays/:stayId', bundleSlot: 'trips-stay' },
  { path: ':tripId/arrangements', bundleSlot: 'trips-arrangements' },
  { path: ':tripId/events/:eventId', bundleSlot: 'trips-event' },
  { path: ':tripId/decisions/:decisionId', bundleSlot: 'trips-decision' },
  { path: ':tripId/journeys/:journeyId', bundleSlot: 'trips-journey' },
  { path: ':tripId/documents', bundleSlot: 'trips-documents' },
  { path: ':tripId/capture', bundleSlot: 'trips-capture' },
  { path: ':tripId/inbox', bundleSlot: 'trips-inbox' },
  { path: ':tripId/explore', bundleSlot: 'trips-explore' },
  { path: ':tripId/settings', bundleSlot: 'trips-settings' },
] as const;

/** Component slots the Trips remote bundle must export. */
export type TripsPageSlot = (typeof TRIPS_PAGES)[number]['bundleSlot'];
