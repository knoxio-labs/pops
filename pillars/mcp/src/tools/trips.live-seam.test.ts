import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { openApiArray, openApiObject } from './openapi-values.js';
import { startTripsLiveSeam } from './trips/test-helpers-live-seam.js';
import {
  callTripTool as call,
  firstRow,
  loseCommittedResponse,
  numberField,
  toolObject,
} from './trips/test-helpers-live-tools.js';
import { sourceText } from './trips/test-helpers.js';

import type { TripsLiveSeam } from './trips/test-helpers-live-seam.js';

let seam: TripsLiveSeam | undefined;
function live(): TripsLiveSeam {
  if (seam === undefined) throw new Error('Trips fixture is not running');
  return seam;
}
async function createTrip(): Promise<number> {
  const result = toolObject(
    await call('trips.createOperation', {
      operationId: randomUUID(),
      command: {
        kind: 'trip.create',
        input: { name: 'Recorded trip', when: '  whenever explicitly recorded  ' },
      },
    })
  );
  return numberField(
    openApiObject(openApiObject(result['current'], 'current')['trip'], 'trip'),
    'id'
  );
}

beforeAll(async () => {
  seam = await startTripsLiveSeam(import.meta.url);
});
beforeEach(() => {
  live().useDefaultKey();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await seam?.stop();
});

describe('registered Trips tools through real registry, HTTP and owning SQLite', () => {
  it('recovers durable Trip creation after response loss without rewriting its receipt or repeating legacy POST', async () => {
    const readTrips = async () =>
      openApiArray(toolObject(await call('trips.list', {}))['trips'], 'trips');
    const beforeCount = (await readTrips()).length;
    const operationId = randomUUID();
    const args = {
      operationId,
      command: { kind: 'trip.create', input: { name: 'Original', when: sourceText } },
    };
    const offset = live().proxy.requests.length;
    const dropped = loseCommittedResponse(
      new URL(live().proxy.baseUrl).origin,
      '/trips/operations'
    );
    expect((await call('trips.createOperation', args)).isError).toBe(true);
    expect(dropped()).toBe(true);
    const writes = () =>
      live()
        .proxy.requests.slice(offset)
        .filter((request) => request.method === 'POST');
    expect(writes()).toHaveLength(1);
    expect(await readTrips()).toHaveLength(beforeCount + 1);
    const recovered = toolObject(await call('trips.createOperation', args));
    expect(await readTrips()).toHaveLength(beforeCount + 1);
    expect(recovered['replayed']).toBe(true);
    const receipt = openApiObject(recovered['receipt'], 'receipt');
    const tripId = numberField(openApiObject(receipt['trip'], 'receipt Trip'), 'id');
    expect(receipt['operationId']).toBe(operationId);
    expect(openApiObject(receipt['trip'], 'receipt Trip')['when']).toBe(sourceText);
    toolObject(await call('trips.update', { id: tripId, name: 'Later edit' }));
    const replay = toolObject(await call('trips.createOperation', args));
    expect(replay['receipt']).toEqual(receipt);
    expect(
      openApiObject(openApiObject(replay['current'], 'current')['trip'], 'current Trip')['name']
    ).toBe('Later edit');
    expect(
      (
        await call('trips.createOperation', {
          ...args,
          command: { kind: 'trip.create', input: { name: 'Changed payload' } },
        })
      ).isError
    ).toBe(true);
    expect(writes().every((request) => request.url.endsWith('/trips/operations'))).toBe(true);
    const trips = await readTrips();
    expect(trips).toHaveLength(beforeCount + 1);
    expect(trips.filter((trip) => openApiObject(trip, 'trip')['id'] === tripId)).toHaveLength(1);
  });

  it('creates and edits the same trip and explicitly selected place/visit identities', async () => {
    const tripId = await createTrip();
    const trip = toolObject(await call('trips.get', { id: tripId }));
    expect(trip['when']).toBe('  whenever explicitly recorded  ');
    await call('trips.update', { id: tripId, notes: sourceText });
    expect(toolObject(await call('trips.get', { id: tripId }))['notes']).toBe(sourceText);
    const first = toolObject(await call('places.create', { name: 'Equal label' }));
    const second = toolObject(await call('places.create', { name: 'Equal label' }));
    expect(first['id']).not.toBe(second['id']);
    const visit = toolObject(
      await call('visits.create', {
        tripId,
        placeId: numberField(second, 'id'),
        notes: 'Selected explicitly',
      })
    );
    expect(visit['placeId']).toBe(second['id']);
    expect(
      toolObject(await call('visits.get', { tripId, id: numberField(visit, 'id') }))['tripId']
    ).toBe(tripId);
    expect(
      live().proxy.requests.some((request) => request.method === 'POST' && request.status === 201)
    ).toBe(true);
  });

  it('keeps Capture and Idea IDs and raw source separate without implicit route insertion', async () => {
    const tripId = await createTrip();
    const beforeRoute = toolObject(await call('route.get', { tripId }));
    const created = toolObject(
      await call('captures.create', {
        tripId,
        operationId: randomUUID(),
        command: {
          kind: 'capture.create',
          input: { originalText: sourceText },
          target: { mode: 'createIdea', input: { name: 'Recorded idea', kind: 'activity' } },
        },
      })
    );
    const current = openApiObject(created['current'], 'current');
    const capture = firstRow(current, 'captures');
    const idea = firstRow(current, 'ideas');
    const association = firstRow(current, 'associations');
    expect(capture['originalText']).toBe(sourceText);
    expect(idea['kind']).toBe('activity');
    expect(association['captureId']).toBe(capture['id']);
    expect(association['target']).toEqual({ kind: 'idea', id: idea['id'] });
    expect(toolObject(await call('route.get', { tripId }))).toEqual(beforeRoute);
  });

  it('replays a lost response with the exact UUID and rejects changed-payload reuse', async () => {
    const tripId = await createTrip();
    const operationId = randomUUID();
    const args = {
      tripId,
      operationId,
      command: { kind: 'capture.create', input: { originalText: sourceText } },
    };
    const dropped = loseCommittedResponse(
      new URL(live().proxy.baseUrl).origin,
      `/trips/${tripId}/captures/create`
    );
    const unknown = await call('captures.create', args);
    expect(unknown.isError).toBe(true);
    expect(dropped()).toBe(true);
    expect(
      live().proxy.requests.filter(
        (request) =>
          request.method === 'POST' && request.url.endsWith(`/trips/${tripId}/captures/create`)
      )
    ).toHaveLength(1);
    const replay = toolObject(await call('captures.create', args));
    expect(replay['replayed']).toBe(true);
    expect(openApiObject(replay['receipt'], 'receipt')['operationId']).toBe(operationId);
    const mismatch = await call('captures.create', {
      ...args,
      command: { kind: 'capture.create', input: { originalText: 'Different payload' } },
    });
    expect(mismatch.isError).toBe(true);
    const workspace = toolObject(await call('captureWorkspace.get', { tripId }));
    expect(workspace['captures']).toHaveLength(1);
    expect(firstRow(workspace, 'captures')['originalText']).toBe(sourceText);
  });

  it('keeps historical receipts after Undo and requires a new UUID for recapture', async () => {
    const tripId = await createTrip();
    const operationId = randomUUID();
    const args = {
      tripId,
      operationId,
      command: { kind: 'capture.create', input: { originalText: sourceText } },
    };
    const created = toolObject(await call('captures.create', args));
    const firstId = numberField(
      firstRow(openApiObject(created['current'], 'current'), 'captures'),
      'id'
    );
    toolObject(
      await call('captures.undo', {
        tripId,
        operationId: randomUUID(),
        command: { kind: 'undo', targetOperationId: operationId },
      })
    );
    const before = toolObject(await call('captureWorkspace.get', { tripId }));
    const replay = toolObject(await call('captures.create', args));
    expect(replay['undone']).toBe(true);
    expect(replay['replayed']).toBe(true);
    expect(replay['receipt']).toEqual(created['receipt']);
    expect(toolObject(await call('captureWorkspace.get', { tripId }))).toEqual(before);
    const recaptured = toolObject(
      await call('captures.create', { ...args, operationId: randomUUID() })
    );
    expect(
      numberField(firstRow(openApiObject(recaptured['current'], 'current'), 'captures'), 'id')
    ).not.toBe(firstId);
  });

  it('records explicit stay, event, rental and transport data and confirms an actual no-content delete', async () => {
    const tripId = await createTrip();
    const stay = toolObject(
      await call('stays.create', { tripId, name: 'Recorded stay', notes: sourceText })
    );
    const event = toolObject(
      await call('events.create', { tripId, name: 'Recorded event', intention: 'Alternative' })
    );
    const rental = toolObject(
      await call('rentals.create', { tripId, provider: 'Recorded provider' })
    );
    const journey = toolObject(await call('journeys.create', { tripId, name: 'Recorded journey' }));
    const journeyId = numberField(journey, 'id');
    const leg = toolObject(
      await call('journeyLegs.create', {
        tripId,
        journeyId,
        mode: 'Explicit custom mode',
        notes: sourceText,
      })
    );
    expect(leg['mode']).toBe('Explicit custom mode');
    expect(
      toolObject(await call('stays.get', { tripId, id: numberField(stay, 'id') }))['notes']
    ).toBe(sourceText);
    expect(
      toolObject(await call('events.get', { tripId, id: numberField(event, 'id') }))['intention']
    ).toBe('Alternative');
    expect(
      toolObject(await call('rentals.get', { tripId, id: numberField(rental, 'id') }))['provider']
    ).toBe('Recorded provider');
    const removed = await call('journeyLegs.delete', {
      tripId,
      journeyId,
      id: numberField(leg, 'id'),
    });
    expect(removed).toEqual({ content: [] });
    expect(
      live().proxy.requests.some((request) => request.method === 'DELETE' && request.status === 204)
    ).toBe(true);
    expect(
      (await call('journeyLegs.get', { tripId, journeyId, id: numberField(leg, 'id') })).isError
    ).toBe(true);
  });

  it('enforces exact producer grants and rejects cross-trip references without partial sources', async () => {
    const firstTrip = await createTrip();
    const secondTrip = await createTrip();
    const place = toolObject(await call('places.create', { name: 'Recorded place' }));
    const visit = toolObject(
      await call('visits.create', { tripId: secondTrip, placeId: numberField(place, 'id') })
    );
    const before = toolObject(await call('captureWorkspace.get', { tripId: firstTrip }));
    const foreign = await call('captures.create', {
      tripId: firstTrip,
      operationId: randomUUID(),
      command: {
        kind: 'capture.create',
        input: { originalText: sourceText, visitId: numberField(visit, 'id') },
        target: { mode: 'createIdea', input: { name: 'Must roll back' } },
      },
    });
    expect(foreign.isError).toBe(true);
    expect(toolObject(await call('captureWorkspace.get', { tripId: firstTrip }))).toEqual(before);
    live().useKey(await live().mintKey(['trips.trips.list']));
    const denied = await call('trips.create', { name: 'No grant' });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain('trips.trips.create');
    expect((await call('trips.list', {})).isError).not.toBe(true);
  });

  it('retains foreign Handled by work when Undo would remove its created journey', async () => {
    const tripId = await createTrip();
    const operationId = randomUUID();
    const created = toolObject(
      await call('captures.create', {
        tripId,
        operationId,
        command: {
          kind: 'capture.create',
          input: { originalText: sourceText },
          target: { mode: 'createJourney', input: { name: 'Explicit journey' } },
        },
      })
    );
    const journeyId = numberField(
      firstRow(openApiObject(created['current'], 'current'), 'journeys'),
      'id'
    );
    const target = { tripId, targetKind: 'journey', targetId: journeyId };
    toolObject(
      await call('responsibilities.replace', {
        ...target,
        expectedRevision: 0,
        responsibility: { kind: 'self' },
      })
    );
    const undo = {
      tripId,
      operationId: randomUUID(),
      command: { kind: 'undo', targetOperationId: operationId },
    };
    const blocked = await call('captures.undo', undo);
    expect(blocked.isError).toBe(true);
    const retained = toolObject(await call('responsibilities.get', target));
    expect(retained['responsibility']).toEqual({ kind: 'self' });
    expect(toolObject(await call('journeys.get', { tripId, id: journeyId }))['id']).toBe(journeyId);
    toolObject(
      await call('responsibilities.replace', {
        ...target,
        expectedRevision: numberField(retained, 'revision'),
        responsibility: null,
      })
    );
    toolObject(await call('captures.undo', undo));
    expect((await call('journeys.get', { tripId, id: journeyId })).isError).toBe(true);
  });

  it('refuses an unresolved Contacts association without inventing a local person or assignment', async () => {
    const tripId = await createTrip();
    const event = toolObject(await call('events.create', { tripId, name: 'Recorded event' }));
    const target = { tripId, targetKind: 'event', targetId: numberField(event, 'id') };
    const before = toolObject(await call('responsibilities.get', target));
    const failed = await call('responsibilities.replace', {
      ...target,
      expectedRevision: numberField(before, 'revision'),
      responsibility: { kind: 'contact', uri: 'pops:contacts/contact/fixture-unavailable' },
    });
    expect(failed.isError).toBe(true);
    expect(toolObject(await call('responsibilities.get', target))).toEqual(before);
    expect(
      toolObject(await call('events.get', { tripId, id: numberField(event, 'id') }))['id']
    ).toBe(event['id']);
  });
});
