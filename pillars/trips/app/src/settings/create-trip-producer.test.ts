import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { loadTrips, updateTrip } from '../api/source';
import { creationProducer } from './create-trip-producer-test-utils';
import { retainTripCreation } from './create-trip-store';
import { creationOperationId } from './create-trip-test-utils';
import { tripDraft } from './model';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

it(
  'creates exactly one SQLite Trip after response loss, explicit recovery and historical replay, preserving original versus current metadata',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    const producer = await creationProducer();
    const scope = new QueryClient();
    try {
      const clients = { tripClient: producer.client };
      const beforeRows = await loadTrips(clients);
      const before = beforeRows.length;
      const session = retainTripCreation(scope, producer.client);
      const original = {
        ...tripDraft(),
        destination: '  京都 🗺️  ',
        when: '  after graduation,\nperhaps  ',
        notes: 'Original explicit notes',
      };
      session.change(original);
      producer.lose();
      await session.create();
      expect(session.snapshot().locked).toBe(true);
      expect(session.snapshot().confirmed).toBe(false);
      expect(session.snapshot().error).toBeDefined();
      const afterLoss = await loadTrips(clients);
      expect(afterLoss).toHaveLength(before + 1);
      const created = afterLoss.find(
        (trip) => !beforeRows.some((previous) => previous.id === trip.id)
      );
      if (!created) throw new Error('Missing created source');
      session.change({ ...original, notes: 'Later unsaved draft' });
      producer.client.setConfig({ baseUrl: 'http://foreign-owner.test' });
      await session.retry();
      expect(producer.requests).toHaveLength(1);
      producer.client.setConfig({ baseUrl: producer.origin });
      await updateTrip(
        created.id,
        { name: 'Later canonical metadata', when: 'Changed independently' },
        clients
      );
      scope.clear();
      expect(retainTripCreation(scope, producer.client)).toBe(session);
      await session.retry();
      const recovered = session.takeConfirmation();
      expect(recovered).toMatchObject({
        receipt: { trip: { id: created.id, ...original, name: null, tagId: null, parentId: null } },
        current: {
          trip: { id: created.id, name: 'Later canonical metadata', when: 'Changed independently' },
        },
        replayed: true,
      });
      expect(session.snapshot().draft.notes).toBe('Later unsaved draft');
      expect(producer.requests).toHaveLength(2);
      expect(producer.requests[1]).toEqual(producer.requests[0]);
      expect(await loadTrips(clients)).toHaveLength(before + 1);
      const submitted = producer.requests[0];
      if (!submitted) throw new Error('Missing original command');
      const replay = await fetch(submitted.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'fixture' },
        body: submitted.body,
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(recovered);
      expect(await loadTrips(clients)).toHaveLength(before + 1);
    } finally {
      scope.clear();
      await producer.close();
    }
  }
);

it(
  'uses the actual parent-invalid rollback proof to permit correction and a new UUID',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    const producer = await creationProducer();
    const scope = new QueryClient();
    try {
      const clients = { tripClient: producer.client };
      const before = (await loadTrips(clients)).length;
      const session = retainTripCreation(scope, producer.client);
      session.change({
        ...tripDraft(),
        parentId: String(Number.MAX_SAFE_INTEGER),
        when: '  opaque When  ',
      });
      await session.create();
      expect(session.snapshot().locked).toBe(false);
      expect(session.snapshot().error).toMatchObject({
        status: 400,
        code: 'trips.trip.parent_invalid',
      });
      expect(await loadTrips(clients)).toHaveLength(before);
      session.change({ ...session.snapshot().draft, parentId: String(producer.tripId) });
      await session.create();
      expect(session.takeConfirmation()).toMatchObject({
        receipt: { trip: { parentId: producer.tripId, when: '  opaque When  ' } },
      });
      expect(await loadTrips(clients)).toHaveLength(before + 1);
      const ids = await Promise.all(
        producer.requests.map(({ url, body }) =>
          creationOperationId(new Request(url, { method: 'POST', body }))
        )
      );
      expect(ids).toHaveLength(2);
      expect(ids[1]).not.toBe(ids[0]);
    } finally {
      scope.clear();
      await producer.close();
    }
  }
);
