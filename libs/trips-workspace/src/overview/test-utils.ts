import { captureSource } from '../capture/test-utils';
import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { routeRead } from '../route/test-utils';
import { sourcePlaces, sourceStay, sourceVisits } from '../stay/test-utils';

import type { Trip } from '../stay/types';
import type { OverviewEvent, OverviewLabels, TripOverviewProps } from './types';

/** Independently authored trip fixture for source-backed overview tests. */
export const overviewTrip: Trip = {
  id: 7,
  name: 'Coast trip',
  destination: '',
  when: 'After the exams',
  notes: '',
  parentId: null,
  tagId: null,
  sourceLinks: [],
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};
/** Independently captured event preserving all three status axes. */
export function sourceEvent(overrides: Partial<OverviewEvent> = {}): OverviewEvent {
  return {
    id: 61,
    tripId: 7,
    visitId: 31,
    name: 'Harbour festival',
    intention: 'Alternative',
    arrangement: 'Booked',
    purchase: null,
    timing: { start: '2029-05-02' },
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: overviewTrip.createdAt,
    updatedAt: overviewTrip.updatedAt,
    ...overrides,
  };
}
/** English control labels supplied by a host independently of the production translations. */
export const overviewLabels: OverviewLabels = {
  trip: 'Trip',
  route: 'Route',
  journeys: 'Journeys',
  unassociated: 'Unassociated',
  decisions: 'Decisions',
  documents: 'Documents',
  notes: 'Notes',
  empty: 'No route entries.',
  loading: 'Loading trip sources…',
  unavailable: 'Source unavailable',
  retry: 'Retry',
  settings: 'Trip settings',
  current: 'Current journey',
  alternatives: 'Alternatives',
  selected: 'Selected',
  unresolved: 'Unresolved',
  source: (kind, id) => `${kind} #${id}`,
  status: (value) => value,
};
/** Literal source routes used to verify overview links without importing another application's router. */
export const overviewProps: TripOverviewProps = {
  tripId: 7,
  locale: 'en-AU',
  labels: overviewLabels,
  backHref: '/trips',
  settingsHref: '/trips/7/settings',
  href: (kind, id) => `/trips/7/${kind}s/${id}`,
};
/** Full generated-client response map; missing paths are deliberate source failures. */
export function overviewResponses(): Map<string, unknown> {
  return new Map<string, unknown>([
    ['/trips/7', overviewTrip],
    ['/places', { places: sourcePlaces }],
    ['/trips/7/visits', { visits: sourceVisits }],
    ['/trips/7/stays', { stays: [sourceStay()] }],
    ['/trips/7/events', { events: [sourceEvent()] }],
    ['/trips/7/journeys', { journeys: [sourceJourney()] }],
    ['/trips/7/journeys/20/legs', { legs: [sourceLeg()] }],
    ['/trips/7/journey-groups', { groups: [] }],
    ['/trips/7/decisions', { decisions: [] }],
    ['/trips/7/document-associations', { associations: [] }],
    ['/trips/7/meeting-plans', { meetingPlans: [] }],
    ['/trips/7/capture-workspace', captureSource()],
    ['/trips/7/rentals', { rentals: [] }],
    [
      '/trips/7/route',
      routeRead({ order: sourceVisits.map((visit) => ({ kind: 'visit', id: visit.id })) }),
    ],
  ]);
}
