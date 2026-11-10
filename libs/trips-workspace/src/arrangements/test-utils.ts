import { sourceEvent } from '../event/test-utils';
import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { sourcePlaces, sourceStay, sourceVisits } from '../stay/test-utils';
import { createClient } from '../trips-api/client';

import type { ArrangementLabels, ArrangementResponsibility, Rental } from './types';

/** Independent English control labels for component tests; production translations belong to the host. */
export const labels: ArrangementLabels = {
  title: 'Arrangements',
  invalidIdentity: 'Choose a valid trip',
  loading: 'Loading arrangements',
  empty: 'No matching arrangements',
  search: 'Search arrangements',
  kind: 'Kind',
  allKinds: 'All kinds',
  purchase: 'Purchase',
  allPurchases: 'All purchase states',
  notPurchased: 'Not purchased',
  noVisit: 'No visit',
  visit: 'Visit',
  contactReference: 'Contact',
  contactMissing: 'Contact not found',
  contactsUnavailable: 'Contacts unavailable',
  contactReadError: 'Contact could not be loaded',
  referenceDetails: 'Reference details',
  visitUnavailable: 'Visit reference not resolved',
  placeUnavailable: 'Place unavailable',
  journey: 'Journeys',
  stay: 'Stay',
  event: 'Event',
  rental: 'Rental',
  close: 'Close',
  handledBy: 'Handled by',
  self: 'Self',
  unset: 'Unset',
  clear: 'Clear responsibility',
  chooseContact: 'Choose contact',
  reconcileResponsibility: 'Start a new responsibility change',
  responsibilityUncertain:
    'The previous change may still apply. Reloading does not confirm its outcome.',
  pickup: 'Pickup',
  return: 'Return',
  provider: 'Provider',
  start: 'Start date',
  end: 'End date',
  status: 'Booking state',
  save: 'Save changes',
  undo: 'Undo',
  reload: 'Reload source',
  sourceChanged: 'The source changed',
  unknownCoverage: 'Accommodation coverage unknown',
  accommodationMissing: 'Accommodation not arranged',
  accommodationOverlap: 'Overlapping accommodation',
  addStay: 'Add stay',
  creationUncertain:
    'The previous stay may still be created. Open an existing stay or explicitly start a new stay.',
  beginNewStay: 'Start a new stay',
  sourceStates: {
    Considering: 'Considering',
    Agreed: 'Agreed',
    Reserved: 'Reserved',
    Purchased: 'Purchased',
    'In plan': 'In plan',
    Alternative: 'Alternative',
    Booked: 'Booked',
    'Not arranged': 'Not arranged',
    'Not needed': 'Not needed',
  },
};
/** One canonical rental spans distinct explicit Visit occurrences, without source clocks. */
export function sourceRental(overrides: Partial<Rental> = {}): Rental {
  return {
    id: 61,
    tripId: 7,
    provider: 'Harbour cars',
    pickupVisitId: 31,
    returnVisitId: 32,
    start: '2029-05-01',
    end: '2029-05-09',
    status: 'Reserved',
    revision: 0,
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Controlled generated transport records canonical paths, owner identities and exact revisioned writes. */
export function arrangementsTransport() {
  let rental = sourceRental();
  const responsibility: ArrangementResponsibility = {
    tripId: 7,
    targetKind: 'rental',
    targetId: 61,
    revision: 4,
    responsibility: { kind: 'contact', uri: 'pops:contacts/contact/unavailable' },
  };
  const writes: { path: string; method: string; body: unknown }[] = [];
  const requests: Request[] = [];
  const replies: { status: number; body: unknown }[] = [];
  const failures = new Set<string>();
  const collections = new Map<string, unknown>();
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') {
      const body: unknown = await request.json();
      writes.push({ path, method: request.method, body });
      const failure = replies.shift();
      if (failure) return json(failure.body, failure.status);
      return json(
        {
          code: 'trips.test.unspecified_reply',
          message: 'No explicit write response supplied',
          retryable: false,
        },
        500
      );
    }
    if (failures.has(path))
      return json(
        { code: 'trips.temporarily_unavailable', message: 'Source unavailable', retryable: true },
        503
      );
    if (collections.has(path)) return json(collections.get(path));
    return sourceResponse(path, rental, responsibility);
  };
  return {
    client: createClient({ baseUrl: 'http://arrangements.test', fetch: fetcher }),
    requests,
    writes,
    replies,
    failures,
    collections,
    setRental: (source: Rental): void => {
      rental = source;
    },
  };
}
function sourceResponse(
  path: string,
  rental: Rental,
  responsibility: ArrangementResponsibility
): Response {
  if (path.endsWith('/rentals/61')) return json(rental);
  if (path.includes('/responsibilities/'))
    return json({
      ...responsibility,
      targetKind: path.split('/').at(-2),
      targetId: Number(path.split('/').at(-1)),
    });
  const collections: Record<string, unknown> = {
    '/trips/7/visits': { visits: [sourceVisits[0]!, { ...sourceVisits[0]!, id: 32 }] },
    '/places': { places: sourcePlaces },
    '/trips/7/stays': {
      stays: [sourceStay({ timing: { arrival: '2029-05-01', departure: '2029-05-04' } })],
    },
    '/trips/7/events': { events: [sourceEvent()] },
    '/trips/7/journeys': { journeys: [sourceJourney()] },
    '/trips/7/journeys/20/legs': { legs: [sourceLeg()], revision: 0 },
    '/trips/7/rentals': { rentals: [rental] },
    '/trips/7/responsibilities': { responsibilities: [responsibility] },
    '/trips/7': {
      id: 7,
      name: 'Coast trip',
      destination: '',
      when: '',
      tagId: null,
      parentId: null,
      notes: '',
      sourceLinks: [],
      createdAt: rental.createdAt,
      updatedAt: rental.updatedAt,
    },
  };
  if (path in collections) return json(collections[path]);
  return json(
    { code: 'trips.record.not_found', message: 'Source unavailable', retryable: false },
    404
  );
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
