import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createClient as createTagsClient } from '../tags-api/client';
import { client as defaultTagsClient } from '../tags-api/client.gen';
import { createClient } from '../trips-api/client';
import { client as defaultTripClient } from '../trips-api/client.gen';
import {
  createTrip,
  loadPlaces,
  loadTags,
  loadTrip,
  loadTrips,
  loadVisits,
  sourceProblem,
  tripKeys,
  updateTrip,
} from './source';

import type { Server } from 'node:http';

import type { ApiClients, Trip, TripInput, Visit } from './types';

const trip: Trip = {
  id: 7,
  name: null,
  destination: '  Québec  ',
  when: '  sometime after winter  ',
  parentId: null,
  tagId: null,
  notes: '',
  sourceLinks: [{ uri: 'https://example.test/source' }],
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
const visits: Visit[] = [13, 2].map((id) => ({
  id,
  tripId: 7,
  placeId: id,
  revision: 0,
  timing: {},
  notes: '',
  sourceLinks: [],
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
}));
let server: Server;
let origin: string;
const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];

beforeEach(async () => {
  requests.length = 0;
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      requests.push({ method: request.method, path: request.url, body });
      response.setHeader('content-type', 'application/json');
      const refused = request.headers['x-test-refuse'] === 'true';
      if (!request.headers['x-api-key'] || refused) {
        response.writeHead(refused ? 400 : 401);
        response.end(
          JSON.stringify({
            code: refused ? 'trips.request.invalid' : 'trips.authentication.required',
            message: refused ? 'Source validation failed' : 'Authentication is required',
            retryable: false,
            requestId: 'request-over-http',
          })
        );
        return;
      }
      if (request.url === '/trips' && request.method === 'GET') {
        response.end(JSON.stringify({ trips: [trip] }));
      } else if (request.url === '/trips/7/visits') {
        response.end(JSON.stringify({ visits }));
      } else if (request.url === '/places') {
        response.end(JSON.stringify({ places: [] }));
      } else if (request.url === '/tags') {
        response.end(JSON.stringify({ tags: [] }));
      } else {
        response.writeHead(request.method === 'POST' ? 201 : 200);
        response.end(JSON.stringify(trip));
      }
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function clients(): ApiClients {
  const config = { baseUrl: origin, headers: { 'x-api-key': 'test-account' } };
  return { tripClient: createClient(config), tagsClient: createTagsClient(config) };
}

describe('source adapters over generated HTTP clients', () => {
  it('uses owning routes, keeps source identity and preserves explicit visit order', async () => {
    const transport = clients();
    expect(await loadTrips(transport)).toEqual([trip]);
    expect(await loadTrip(7, transport)).toEqual(trip);
    expect(await loadVisits(7, transport)).toEqual(visits);
    expect(await loadPlaces(transport)).toEqual([]);
    expect(await loadTags(transport)).toEqual([]);
    expect(requests).toEqual([
      { method: 'GET', path: '/trips', body: '' },
      { method: 'GET', path: '/trips/7', body: '' },
      { method: 'GET', path: '/trips/7/visits', body: '' },
      { method: 'GET', path: '/places', body: '' },
      { method: 'GET', path: '/tags', body: '' },
    ]);
  });

  it('sends only explicit create and update fields without injecting titles, dates or source links', async () => {
    const transport = clients();
    const body: TripInput = { destination: trip.destination, when: trip.when, name: null };
    expect(await createTrip(body, transport)).toEqual(trip);
    expect(await updateTrip(7, { notes: '  edited  ' }, transport)).toEqual(trip);
    expect(await createTrip({}, transport)).toEqual(trip);
    expect(requests).toEqual([
      { method: 'POST', path: '/trips', body: JSON.stringify(body) },
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify({ notes: '  edited  ' }) },
      { method: 'POST', path: '/trips', body: '{}' },
    ]);
  });

  it('allows an explicitly supplied source-link replacement or clear without merging cached links', async () => {
    const transport = clients();
    await loadTrip(7, transport);
    const replacement = [{ uri: 'https://example.test/replacement', label: 'Replacement' }];
    await updateTrip(7, { sourceLinks: replacement }, transport);
    await updateTrip(7, { sourceLinks: [] }, transport);
    expect(requests.slice(1)).toEqual([
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify({ sourceLinks: replacement }) },
      { method: 'PATCH', path: '/trips/7', body: JSON.stringify({ sourceLinks: [] }) },
    ]);
  });

  it('retains structured authentication and validation diagnostics', async () => {
    const unauthenticated = { tripClient: createClient({ baseUrl: origin }) };
    await expect(loadTrip(7, unauthenticated)).rejects.toMatchObject({
      status: 401,
      code: 'trips.authentication.required',
      retryable: false,
      requestId: 'request-over-http',
    });
    const refused = {
      tripClient: createClient({
        baseUrl: origin,
        headers: { 'x-api-key': 'test-account', 'x-test-refuse': 'true' },
      }),
    };
    await expect(createTrip({}, refused)).rejects.toMatchObject({
      status: 400,
      code: 'trips.request.invalid',
      retryable: false,
      requestId: 'request-over-http',
    });
  });

  it('exposes safe diagnostics and never arbitrary transport error details', () => {
    expect(sourceProblem(new Error('private transport detail'))).toEqual({
      code: 'trips.web.request_failed',
      message: 'The request could not be completed',
      retryable: true,
    });
    const problem = new ApiError({
      kind: 'client',
      code: 'trips.request.invalid',
      message: 'Source validation failed',
      retryable: false,
    });
    expect(sourceProblem(problem)).toBe(problem);
  });

  it('scopes every cache key to its owning API origin and source identity', () => {
    expect(defaultTripClient.getConfig().baseUrl).toBe('/trips-api');
    expect(defaultTagsClient.getConfig().baseUrl).toBe('/tags-api');
    const tripOrigin = 'https://trips.example.test';
    const tagsOrigin = 'https://tags.example.test';
    const keys = tripKeys({
      tripClient: createClient({ baseUrl: tripOrigin }),
      tagsClient: createTagsClient({ baseUrl: tagsOrigin }),
    });
    expect(keys.all).toEqual(['trips', tripOrigin, 'list']);
    expect(keys.places).toEqual(['trips', tripOrigin, 'places']);
    expect(keys.one(7)).toEqual(['trips', tripOrigin, 7]);
    expect(keys.visits(13)).toEqual(['trips', tripOrigin, 13, 'visits']);
    expect(keys.tags).toEqual(['tags', tagsOrigin, 'list']);
    expect(tripKeys().all).toEqual(['trips', '/trips-api', 'list']);
    expect(tripKeys().tags).toEqual(['tags', '/tags-api', 'list']);
    expect(tripKeys(clients()).all).not.toEqual(keys.all);
  });
});
