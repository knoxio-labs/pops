import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { EventSchema } from '../../contract/event-schemas.js';
import { openTripsDb } from '../../db/index.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

describe('Event HTTP ownership and projected scopes', () => {
  it('authenticates every operation and keeps rejected source edits atomic', async () => {
    const opened = openTripsDb(':memory:');
    const trip = createTrip(opened.db, {});
    const foreign = createTrip(opened.db, {});
    const server = createTripsApiApp({
      tripsDb: opened,
      version: 'test',
      selfBaseUrl: 'http://localhost:3018',
      serviceAccountVerifier: async (key) => ({
        outcome: 'authenticated',
        principal: {
          id: 'test',
          name: 'test',
          scopes: [key === 'events' ? 'trips.events' : 'trips.stays'],
        },
      }),
    }).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
      const origin = `http://127.0.0.1:${address.port}`;
      const path = `/trips/${trip.id}/events`;
      const request = (
        url: string,
        method: string,
        body?: unknown,
        key: string | null = 'events'
      ): Promise<Response> =>
        fetch(`${origin}${url}`, {
          method,
          headers: {
            ...(key === null ? {} : { 'x-api-key': key }),
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      expect((await request(path, 'GET', undefined, null)).status).toBe(401);
      expect((await request(path, 'GET', undefined, 'stays')).status).toBe(403);
      const created = await request(path, 'POST', {
        name: 'Birthday',
        timing: { start: '2027-12-16' },
      });
      expect(created.status).toBe(201);
      const event = EventSchema.parse(await created.json());
      expect(event.purchase).toBeNull();
      const sourcePath = `${path}/${event.id}`;
      for (const [method, body] of [
        ['GET', undefined],
        ['PATCH', {}],
        ['DELETE', undefined],
      ] as const) {
        expect((await request(sourcePath, method, body, 'stays')).status).toBe(403);
        expect(
          (await request(`/trips/${foreign.id}/events/${event.id}`, method, body)).status
        ).toBe(404);
      }
      expect((await request(path, 'POST', { timing: { startTime: '24:00' } })).status).toBe(400);
      expect(
        (await request(sourcePath, 'PATCH', { visitId: 99999, name: 'Rejected' })).status
      ).toBe(404);
      expect(await (await request(sourcePath, 'GET')).json()).toEqual(event);
      const updated = await request(sourcePath, 'PATCH', { purchase: 'Purchased' });
      expect(updated.status).toBe(200);
      expect(EventSchema.parse(await updated.json())).toMatchObject({
        intention: null,
        arrangement: null,
        purchase: 'Purchased',
        timing: { start: '2027-12-16' },
      });
      expect((await request(sourcePath, 'DELETE')).status).toBe(204);
      expect(await (await request(path, 'GET')).json()).toEqual({ events: [] });
      const spec: unknown = await (await fetch(`${origin}/openapi`)).json();
      expect(spec).toMatchObject({
        paths: { '/trips/{tripId}/events': { post: { operationId: 'events.create' } } },
      });
    } finally {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      opened.raw.close();
    }
  });
});
