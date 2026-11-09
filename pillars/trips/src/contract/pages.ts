/** Shell routes and remote bundle slots shared by Trips registration and its UI. */
export const TRIPS_PAGES = [
  { path: '', index: true, bundleSlot: 'trips-home' },
  { path: ':tripId/calendar', bundleSlot: 'trips-calendar' },
  { path: ':tripId/stays/:stayId', bundleSlot: 'trips-stay' },
  { path: ':tripId/journeys/:journeyId', bundleSlot: 'trips-journey' },
  { path: ':tripId/settings', bundleSlot: 'trips-settings' },
] as const;

/** Component slots the Trips remote bundle must export. */
export type TripsPageSlot = (typeof TRIPS_PAGES)[number]['bundleSlot'];
