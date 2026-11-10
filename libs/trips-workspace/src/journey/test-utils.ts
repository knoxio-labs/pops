import { createClient } from '../trips-api/client';

import type { Journey, JourneyLeg, JourneySource, JourneyGroup, JourneyTiming } from './types';

/** Independent fictional source metadata, unrelated to playground fixtures. */
export function sourceJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 20,
    tripId: 7,
    name: 'Harbour connection',
    reference: 'SOURCE-20',
    notes: '',
    sourceLinks: [{ uri: 'pops:documents/source/opaque', label: 'Original source' }],
    buffers: { airportBufferMinutes: 75 },
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Source legs deliberately retain unknown zones and independent booking/purchase facts. */
export function sourceLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    id: 40,
    journeyId: 20,
    mode: 'Hydrofoil',
    from: {
      sourceLabel: 'Old wharf',
      placeId: 51,
      local: '2029-02-01T22:15',
      sourceLinks: [{ uri: 'https://source.example/departure' }],
    },
    to: { local: '2029-02-02T01:15', timeZone: 'Pacific/Auckland' },
    intention: 'Considering',
    arrangement: 'Booked',
    purchase: null,
    operator: 'Harbour operator',
    service: null,
    reference: null,
    notes: '',
    sourceLinks: [{ uri: 'pops:documents/opaque-leg' }],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Generated transport seam records serialized requests while serving explicit canonical responses. */
export function journeyTransport(
  options: {
    source?: JourneySource;
    writes?: { status: number; body: unknown }[];
    groups?: JourneyGroup[];
    timing?: JourneyTiming;
    contextFailure?: boolean;
    sourceFailure?: number;
    alternatives?: JourneySource[];
    writeWait?: Promise<void>;
    readWait?: { path: string; promise: Promise<void> };
  } = {}
) {
  let source = options.source ?? { legRevision: 0, journey: sourceJourney(), legs: [sourceLeg()] };
  const responses = [...(options.writes ?? [])];
  let sourceFailure = options.sourceFailure;
  let writeWait = options.writeWait;
  let groups = options.groups ?? [];
  let groupFailure: number | undefined;
  let groupWait: Promise<void> | undefined;
  const requests: { method: string; path: string; body: unknown }[] = [];
  const client = createClient({
    baseUrl: 'http://journeys.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const body: unknown =
        request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.json();
      requests.push({ method: request.method, path, body });
      if (request.method !== 'GET') {
        await writeWait;
        const response = responses.shift();
        if (!response) throw new Error('No explicit source write response supplied');
        return new Response(response.status === 204 ? null : JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (path === options.readWait?.path) await options.readWait.promise;
      const requestedId = Number(/\/journeys\/(\d+)/u.exec(path)?.[1]);
      const current =
        options.alternatives?.find((entry) => entry.journey.id === requestedId) ?? source;
      let status = 200;
      let response: unknown;
      if (path.endsWith('/journey-groups')) {
        await groupWait;
        response = groupFailure ? sourceProblem('trips.groups.unavailable') : { groups };
        status = groupFailure ?? 200;
      } else if (path.endsWith('/timing'))
        response = options.timing ?? {
          journeyId: 20,
          legs: [],
          connections: [],
          window: null,
          findings: [],
        };
      else if (path === '/places')
        response = {
          places: [
            {
              id: 51,
              name: 'Harbour',
              sourceLinks: [],
              createdAt: source.journey.createdAt,
              updatedAt: source.journey.updatedAt,
            },
          ],
        };
      else if (path.endsWith('/legs'))
        response = { revision: current.legRevision, legs: current.legs };
      else response = current.journey;
      if (Number.isFinite(requestedId) && current.journey.id !== requestedId) {
        status = 404;
        response = sourceProblem('trips.record.not_found');
      }
      if (
        sourceFailure &&
        !path.endsWith('/journey-groups') &&
        !path.endsWith('/timing') &&
        path !== '/places'
      ) {
        status = sourceFailure;
        response = sourceProblem();
      }
      if (options.contextFailure && (path.endsWith('/timing') || path === '/places')) {
        status = 503;
        response = sourceProblem('trips.context.unavailable');
      }
      return new Response(JSON.stringify(response), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return {
    client,
    requests,
    setSource: (next: JourneySource) => {
      source = next;
    },
    failSource: (status: number) => {
      sourceFailure = status;
    },
    groupRead: (next: JourneyGroup[], failure?: number, wait?: Promise<void>) => {
      groups = next;
      groupFailure = failure;
      groupWait = wait;
    },
    waitWrites: (promise: Promise<void>) => {
      writeWait = promise;
    },
  };
}

/** Safe contract diagnostic shared by deliberate response failures. */
export function sourceProblem(code = 'trips.source.invalid') {
  return {
    code,
    message: 'The source request could not be completed',
    retryable: true,
    requestId: 'journey-test-request',
  };
}
