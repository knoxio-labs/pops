import { once } from 'node:events';

import { expect, it } from 'vitest';

import { JourneyWorkspaceSchema } from '../../contract/journey-workspace.js';
import { openTripsDb } from '../../db/index.js';
import { createJourneyLeg, updateJourneyLeg } from '../../db/services/journey-legs.js';
import { createJourney } from '../../db/services/journeys.js';
import { createTrip } from '../../db/services/records.js';
import { deriveJourneyTiming } from '../../domain/journey-timing.js';
import { createTripsApiApp } from '../app.js';

it('publishes an authenticated trip-owned snapshot whose timing matches exactly its returned source legs', async () => {
  const opened = openTripsDb(':memory:');
  const trip = createTrip(opened.db, {});
  const foreign = createTrip(opened.db, {});
  const journey = createJourney(opened.db, trip.id, { name: 'Source journey' });
  const leg = createJourneyLeg(opened.db, trip.id, journey.id, {
    from: { local: '2029-02-01T22:15', timeZone: 'Pacific/Auckland' },
    to: { local: '2029-02-01T10:00', timeZone: 'Pacific/Honolulu' },
  });
  const server = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: {
        id: 'test',
        name: 'test',
        scopes: [key === 'journeys' ? 'trips.journeys' : 'trips.journeyLegs'],
      },
    }),
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    const origin = `http://127.0.0.1:${address.port}`;
    const path = `/trips/${trip.id}/journeys/${journey.id}/workspace`;
    const read = (url = path, key: string | null = 'journeys'): Promise<Response> =>
      fetch(`${origin}${url}`, { headers: key === null ? {} : { 'x-api-key': key } });
    expect((await read(path, null)).status).toBe(401);
    expect((await read(path, 'legs')).status).toBe(403);
    expect((await read(`/trips/${foreign.id}/journeys/${journey.id}/workspace`)).status).toBe(404);
    expect((await read(`/trips/${trip.id}/journeys/99999/workspace`)).status).toBe(404);
    expect((await read(`/trips/${trip.id}/journeys/not-an-id/workspace`)).status).toBe(400);
    const response = await read();
    expect(response.status).toBe(200);
    const snapshot = JourneyWorkspaceSchema.parse(await response.json());
    expect(snapshot).toEqual({
      journey,
      legs: [leg],
      timing: deriveJourneyTiming(journey.id, [leg]),
    });
    const changed = updateJourneyLeg(
      opened.db,
      { tripId: trip.id, journeyId: journey.id, id: leg.id },
      { from: { local: '2029-02-03T22:15', timeZone: 'Pacific/Auckland' } }
    );
    const next = JourneyWorkspaceSchema.parse(await (await read()).json());
    expect(next.legs).toEqual([changed]);
    expect(next.timing).toEqual(deriveJourneyTiming(journey.id, next.legs));
    expect(next.timing.findings).toMatchObject([{ code: 'arrival_before_departure' }]);
    const legPath = `${origin}/trips/${trip.id}/journeys/${journey.id}/legs/${leg.id}`;
    const patch = (body: unknown) =>
      fetch(legPath, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-api-key': 'legs' },
        body: JSON.stringify(body),
      });
    expect((await patch({ from: { date: '2028-02-29' }, to: {} })).status).toBe(200);
    const daySnapshot = JourneyWorkspaceSchema.parse(await (await read()).json());
    expect(daySnapshot.legs[0]?.from).toEqual({ date: '2028-02-29' });
    expect(daySnapshot.timing.legs[0]).toEqual({
      legId: leg.id,
      departure: null,
      arrival: null,
      elapsedMinutes: null,
      departureSource: { date: '2028-02-29', precision: 'day' },
      arrivalSource: { date: null, precision: 'unknown' },
    });
    expect((await patch({ from: { date: '2028-02-29', local: '2028-02-29T11:00' } })).status).toBe(
      400
    );
    expect(JourneyWorkspaceSchema.parse(await (await read()).json())).toEqual(daySnapshot);
    expect(await (await fetch(`${origin}/openapi`)).json()).toMatchObject({
      paths: {
        '/trips/{tripId}/journeys/{id}/workspace': { get: { operationId: 'journeys.workspace' } },
      },
    });
  } finally {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    opened.raw.close();
  }
});
