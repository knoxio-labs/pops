import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { changeJourney, loadJourney, selectJourney } from './api';
import { sourceJourney, sourceLeg, sourceProblem } from './test-utils';

import type { Server } from 'node:http';

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
      const failure = request.headers['x-test-status'];
      if (typeof failure === 'string') {
        response.writeHead(Number(failure));
        response.end(JSON.stringify(sourceProblem(`trips.http.${failure}`)));
        return;
      }
      if (request.url?.endsWith('/selection')) {
        response.end(
          JSON.stringify({
            id: 80,
            tripId: 7,
            currentJourneyId: 21,
            alternativeJourneyIds: [20],
            revision: 4,
            createdAt: sourceJourney().createdAt,
            updatedAt: sourceJourney().updatedAt,
          })
        );
        return;
      }
      if (request.url?.endsWith('/leg-order')) {
        response.end(JSON.stringify({ revision: 0, legs: [sourceLeg({ id: 41 }), sourceLeg()] }));
        return;
      }
      if (request.url?.endsWith('/legs') && request.method === 'GET') {
        response.end(JSON.stringify({ revision: 0, legs: [sourceLeg()] }));
        return;
      }
      response.end(JSON.stringify(request.url?.includes('/legs/') ? sourceLeg() : sourceJourney()));
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an HTTP address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('Generated journey client over real HTTP', () => {
  it('loads the owning identity and sends only explicit PATCH fields including retained nested endpoint members', async () => {
    const props = { tripId: 7, journeyId: 20, client: createClient({ baseUrl: origin }) };
    const source = await loadJourney(props);
    const from = { ...source.legs[0]?.from, timeZone: 'Pacific/Auckland' };
    await changeJourney(props, source, {
      kind: 'leg',
      id: 40,
      patch: { from },
      expectedRevision: 0,
    });
    expect(
      requests
        .filter((request) => request.method === 'GET')
        .map((request) => request.path)
        .toSorted()
    ).toEqual(['/trips/7/journeys/20', '/trips/7/journeys/20/legs']);
    expect(requests.at(-1)).toEqual({
      method: 'PATCH',
      path: '/trips/7/journeys/20/legs/40',
      body: JSON.stringify({ from, expectedRevision: 0 }),
    });
    expect(from).toHaveProperty('sourceLinks');
  });
  it('persists complete explicit order and returns the original identity order as inverse', async () => {
    const props = { tripId: 7, journeyId: 20, client: createClient({ baseUrl: origin }) };
    const source = {
      legRevision: 0,
      journey: sourceJourney(),
      legs: [sourceLeg(), sourceLeg({ id: 41 })],
    };
    const result = await changeJourney(props, source, {
      kind: 'order',
      ids: [41, 40],
      expectedRevision: 0,
    });
    expect(requests).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/journeys/20/leg-order',
        body: JSON.stringify({ legIds: [41, 40], expectedRevision: 0 }),
      },
    ]);
    expect(result.source.legs.map((leg) => leg.id)).toEqual([41, 40]);
    expect(result.inverse).toEqual({ kind: 'order', ids: [40, 41], expectedRevision: 1 });
  });
  it('selects by source identity and expected revision without sending journey copies', async () => {
    const props = { tripId: 7, journeyId: 20, client: createClient({ baseUrl: origin }) };
    const group = {
      id: 80,
      tripId: 7,
      currentJourneyId: 20,
      alternativeJourneyIds: [21],
      revision: 3,
      createdAt: sourceJourney().createdAt,
      updatedAt: sourceJourney().updatedAt,
    };
    const result = await selectJourney(props, group, 21);
    expect(requests).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/journey-groups/80/selection',
        body: JSON.stringify({ journeyId: 21, expectedRevision: 3 }),
      },
    ]);
    expect(result).toMatchObject({
      currentJourneyId: 21,
      alternativeJourneyIds: [20],
      revision: 4,
    });
  });
  it.each([401, 404, 409])(
    'retains safe owning HTTP %i diagnostics rather than fabricating editable data',
    async (status) => {
      const props = {
        tripId: 7,
        journeyId: 20,
        client: createClient({ baseUrl: origin, headers: { 'x-test-status': String(status) } }),
      };
      await expect(loadJourney(props)).rejects.toMatchObject({
        status,
        code: `trips.http.${status}`,
        requestId: 'journey-test-request',
      });
    }
  );
});
