import { createClient } from '../trips-api/client';

import type { Place, Stay, Visit } from './types';

/** Independent fictional source fixture; no playground state is imported. */
export function sourceStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: 13,
    tripId: 7,
    visitId: 31,
    name: 'Cedar guesthouse',
    kind: 'hotel',
    status: 'Reserved',
    timing: {
      arrival: '2029-04-10',
      departure: '2029-04-14',
      checkIn: '16:00',
      checkOut: '10:00',
      timeZone: 'Pacific/Auckland',
    },
    address: '18 Cedar Lane',
    reference: 'CEDAR-9',
    notes: 'Source notes',
    sourceLinks: [{ uri: 'https://booking.example/cedar', label: 'Original booking' }],
    hostLinks: [{ uri: 'pops:contacts/person/source-host', label: 'Cedar host' }],
    documentLinks: [{ uri: 'pops:documents/document/unavailable' }],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Independent visit source context for the workspace tests. */
export const sourceVisits: Visit[] = [
  {
    id: 31,
    tripId: 7,
    placeId: 51,
    revision: 0,
    timing: { arrival: '2029-05-01', departure: '2029-05-09' },
    notes: '',
    sourceLinks: [],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
  },
];
/** Independent reusable place source. */
export const sourcePlaces: Place[] = [
  {
    id: 51,
    name: 'Wellington',
    sourceLinks: [],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
  },
];
/** A typed transport response, including deliberate HTTP failures. */
export interface TestResponse {
  status: number;
  body: unknown;
}

/** Generated-client transport seam that records real Request bodies and preserves explicit response ordering. */
export function workspaceTransport(
  options: {
    stay?: Stay;
    neighbours?: Stay[];
    patches?: TestResponse[];
    gets?: TestResponse[];
    failContext?: boolean;
  } = {}
) {
  let source = options.stay ?? sourceStay();
  const patchResponses = [...(options.patches ?? [])];
  const getResponses = [...(options.gets ?? [])];
  const patches: unknown[] = [];
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path === '/trips/7/stays/13') {
      if (request.method === 'PATCH') {
        const body: unknown = await request.json();
        patches.push(body);
        const response = patchResponses.shift() ?? { status: 200, body: source };
        return jsonResponse(response);
      }
      return jsonResponse(getResponses.shift() ?? { status: 200, body: source });
    }
    if (options.failContext)
      return jsonResponse({ status: 403, body: problem('trips.scope.denied') });
    if (path === '/trips/7/stays')
      return jsonResponse({
        status: 200,
        body: { stays: [source, ...(options.neighbours ?? [])] },
      });
    if (path === '/trips/7/visits')
      return jsonResponse({ status: 200, body: { visits: sourceVisits } });
    if (path === '/places') return jsonResponse({ status: 200, body: { places: sourcePlaces } });
    if (path === '/trips/7')
      return jsonResponse({
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
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        },
      });
    return jsonResponse({ status: 404, body: problem('trips.record.not_found') });
  };
  return {
    client: createClient({ baseUrl: 'http://trips.test', fetch: fetcher }),
    patches,
    requests,
    setSource: (stay: Stay) => {
      source = stay;
    },
  };
}

/** Safe API envelope used to verify diagnostic error presentation. */
export function problem(code = 'trips.request.invalid') {
  return {
    code,
    message: 'The source could not be saved',
    retryable: true,
    requestId: 'request-example',
  };
}

function jsonResponse(response: TestResponse) {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { 'content-type': 'application/json' },
  });
}
