import { createClient } from '../trips-api/client';

import type { Place, Stay, TripEvent, Visit } from './types';

/** Independent fictional visit occurrence with partial source timing. */
export function sourceVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 31,
    tripId: 7,
    placeId: 51,
    revision: 0,
    timing: { arrival: '2030-04-10', departure: '2030-04-16' },
    notes: 'Visit notes',
    sourceLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Independent source accommodation; checkout remains exclusive. */
export function sourceStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: 13,
    tripId: 7,
    visitId: 31,
    name: 'Cedar guesthouse',
    kind: 'hotel',
    status: 'Reserved',
    timing: { arrival: '2030-04-10', departure: '2030-04-13' },
    address: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    hostLinks: [],
    documentLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Independent source activity including explicit Alternative intention. */
export function sourceEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: 41,
    tripId: 7,
    visitId: 31,
    name: 'Harbour concert',
    intention: 'Alternative',
    arrangement: 'Booked',
    purchase: null,
    timing: { start: '2030-04-13', startTime: '19:30', timeZone: 'Pacific/Auckland' },
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Literal source places remain separate even when their labels match. */
export const places: Place[] = [
  {
    id: 51,
    name: 'Wellington',
    sourceLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
  },
  {
    id: 52,
    name: 'Wellington',
    sourceLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
  },
];
/** Generated-client transport recording exact writes and controlling returned source revisions. */
export function visitTransport(
  options: {
    source?: Visit;
    stays?: Stay[];
    events?: TripEvent[];
    failContext?: boolean;
    failCreation?: boolean;
    creationRejection?: number;
  } = {}
) {
  let source = options.source ?? sourceVisit();
  const patches: unknown[] = [];
  const creates: unknown[] = [];
  const patchReplies: { status: number; body: unknown }[] = [];
  const requests: Request[] = [];
  const currentPlaces = [...places];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path === '/trips/7/visits/31') {
      if (request.method === 'PATCH') {
        patches.push(await request.json());
        const reply = patchReplies.shift() ?? { status: 200, body: source };
        return json(reply.body, reply.status);
      }
      return json(source);
    }
    if (path === '/places' && request.method === 'POST') {
      const body: unknown = await request.json();
      creates.push(body);
      if (options.failCreation) throw new Error('Creation response unavailable');
      if (options.creationRejection)
        return json(
          { code: 'trips.request.invalid', message: 'Rejected source capture', retryable: false },
          options.creationRejection
        );
      const created: Place = {
        id: 52 + creates.length,
        name: 'New city',
        sourceLinks: [],
        createdAt: '2030-01-01T00:00:00Z',
        updatedAt: '2030-01-01T00:00:00Z',
      };
      currentPlaces.push(created);
      return json(created, 201);
    }
    if (options.failContext)
      return json(
        { code: 'trips.scope.denied', message: 'Context unavailable', retryable: true },
        403
      );
    if (path === '/places') return json({ places: currentPlaces });
    if (path === '/trips/7/stays') return json({ stays: options.stays ?? [sourceStay()] });
    if (path === '/trips/7/events') return json({ events: options.events ?? [sourceEvent()] });
    if (path === '/trips/7/visits') return json({ visits: [source, sourceVisit({ id: 32 })] });
    if (path === '/trips/7')
      return json({
        id: 7,
        name: 'Coast trip',
        destination: '',
        when: '',
        parentId: null,
        tagId: null,
        notes: '',
        sourceLinks: [],
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      });
    return json(
      { code: 'trips.record.not_found', message: 'Source unavailable', retryable: false },
      404
    );
  };
  return {
    client: createClient({ baseUrl: 'http://trips.test', fetch: fetcher }),
    patches,
    creates,
    patchReplies,
    requests,
    setSource: (next: Visit) => {
      source = next;
    },
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
