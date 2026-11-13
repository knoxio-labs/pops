import { afterEach, describe, expect, it, vi } from 'vitest';

import { tripsFixture } from '../trips/__tests__/fixtures.js';
import { openMobileTrips, mobileTripsReader } from './mobile-trips-harness.js';
import { requestOn } from './test-http.js';

import type { TestApp } from './harness.js';

const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});

describe('Trip metadata mobile consent and response semantics', () => {
  it.each(['create', 'update'] as const)(
    'requires authentication and explicit write consent for %s',
    async (action) => {
      const createTrip = vi.fn(mobileTripsReader().createTrip);
      const updateTrip = vi.fn(mobileTripsReader().updateTrip);
      const context = openMobileTrips(mobileTripsReader({ createTrip, updateTrip }), [
        'trips.read',
      ]);
      apps.push(context);
      for (const token of [null, context.token]) {
        const response = await requestOn(context.app, (request) => {
          const call =
            action === 'create' ? request.post('/mobile/trips') : request.patch('/mobile/trips/7');
          return (token === null ? call : call.set('Authorization', `Bearer ${token}`)).send({
            when: 'Someday',
          });
        });
        expect(response.status).toBe(token === null ? 401 : 403);
      }
      expect(createTrip).not.toHaveBeenCalled();
      expect(updateTrip).not.toHaveBeenCalled();
    }
  );
  it('returns known201 only from the canonical source result and keeps metadata unchanged', async () => {
    const createTrip = vi.fn(mobileTripsReader().createTrip);
    const context = openMobileTrips(mobileTripsReader({ createTrip }), ['trips.write']);
    apps.push(context);
    const input = { name: null, destination: '', when: 'Christmas, maybe longer' };
    const response = await requestOn(context.app, (request) =>
      request.post('/mobile/trips').set('Authorization', `Bearer ${context.token}`).send(input)
    );
    expect(response.status).toBe(201);
    expect(response.body).toEqual(tripsFixture().trip);
    expect(createTrip).toHaveBeenCalledExactlyOnceWith(input);
  });
  it('keeps a missing source404 distinct from an unavailable create503', async () => {
    const context = openMobileTrips(
      mobileTripsReader({
        createTrip: () => Promise.resolve({ kind: 'unavailable', pillar: 'trips', status: 503 }),
        updateTrip: () => Promise.resolve({ kind: 'not-found', pillar: 'trips', status: 404 }),
      }),
      ['trips.write']
    );
    apps.push(context);
    const create = await requestOn(context.app, (request) =>
      request.post('/mobile/trips').set('Authorization', `Bearer ${context.token}`).send({})
    );
    const update = await requestOn(context.app, (request) =>
      request
        .patch('/mobile/trips/7')
        .set('Authorization', `Bearer ${context.token}`)
        .send({ when: '' })
    );
    expect(create.status).toBe(503);
    expect(update.status).toBe(404);
  });
});
