import { sourcePlaces, sourceVisits, sourceStay, problem } from '../stay/test-utils';
import { createClient } from '../trips-api/client';

import type { Visit } from '../stay/types';
import type { TripEvent } from './types';

/** Fictional event source for tests only; absent clocks and associations are deliberate. */
export function sourceEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: 19,
    tripId: 7,
    visitId: 31,
    name: 'Harbour performance',
    intention: 'Considering',
    arrangement: 'Not arranged',
    purchase: null,
    timing: { start: '2029-04-12' },
    address: 'South quay',
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [{ uri: 'https://source.example/performance', label: 'Original listing' }],
    venueLinks: [{ uri: 'pops:contacts/person/venue' }],
    organiserLinks: [],
    documentLinks: [{ uri: 'pops:documents/document/ticket' }],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Persisted route order deliberately differs from numeric IDs and calendar order. */
export const eventVisits: Visit[] = [
  { ...sourceVisits[0]!, id: 90, placeId: 52, timing: { arrival: '2029-06-01' } },
  sourceVisits[0]!,
  { ...sourceVisits[0]!, id: 2, placeId: 53, timing: {} },
];

/** Typed generated-client transport records exact writes and serves explicit source/error responses. */
export function eventTransport(
  options: {
    source?: TripEvent;
    replies?: { status: number; body: unknown }[];
    failContext?: boolean;
    missing?: boolean;
  } = {}
) {
  let source = options.source ?? sourceEvent();
  let readFailure = false;
  const replies = [...(options.replies ?? [])];
  const patches: unknown[] = [];
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    let response: { status: number; body: unknown };
    if (path === '/trips/7/events/19') {
      if (request.method === 'PATCH') {
        const body: unknown = await request.json();
        patches.push(body);
        response = replies.shift() ?? { status: 200, body: source };
      } else if (readFailure)
        response = { status: 503, body: problem('trips.temporarily_unavailable') };
      else
        response = options.missing
          ? { status: 404, body: problem('trips.record.not_found') }
          : { status: 200, body: source };
    } else if (options.failContext) response = { status: 403, body: problem('trips.scope.denied') };
    else if (path === '/trips/7/visits') response = { status: 200, body: { visits: eventVisits } };
    else if (path === '/places')
      response = {
        status: 200,
        body: {
          places: [
            ...sourcePlaces,
            { ...sourcePlaces[0]!, id: 52, name: 'North inlet' },
            { ...sourcePlaces[0]!, id: 53, name: 'South island' },
          ],
        },
      };
    else if (path === '/trips/7')
      response = {
        status: 200,
        body: {
          id: 7,
          name: 'Source trip',
          destination: '',
          when: '',
          parentId: null,
          tagId: null,
          notes: '',
          sourceLinks: [],
          createdAt: sourceStay().createdAt,
          updatedAt: sourceStay().updatedAt,
        },
      };
    else response = { status: 404, body: problem('trips.record.not_found') };
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    client: createClient({ baseUrl: 'http://event.test', fetch: fetcher }),
    patches,
    requests,
    setSource: (next: TripEvent) => {
      source = next;
    },
    failReads: () => {
      readFailure = true;
    },
    restoreReads: () => {
      readFailure = false;
    },
  };
}
