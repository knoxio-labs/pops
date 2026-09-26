import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebLocationGoneResponseSchema } from '../../contract/rest-web-locations.js';
import { items, locations } from '../../db/index.js';
import {
  createItem,
  createLocation,
  granting,
  openSyncHarness,
  PROTOCOL,
  send,
  SYNC_KEY,
  type SyncHarness,
  wireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
const PHONE_ACTOR = 'device:dev_7f3a;label=Jo%C3%A3o%E2%80%99s%20iPhone';
let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport, { verify: granting(['inventory.sync']) });
});

afterEach(() => h.close());

async function apply(...mutations: ReturnType<typeof wireMutation>[]): Promise<void> {
  const response = await send(h.api, mutations);
  expect(response.status).toBe(200);
}

async function deleteAsDevice(id: string): Promise<void> {
  const response = await h.api
    .post('/sync/mutations')
    .set({ ...PROTOCOL, 'x-api-key': SYNC_KEY, 'pops-actor': PHONE_ACTOR })
    .send({
      mutations: [
        {
          ...wireMutation('location.delete', id, {}),
          baseRevision: 1,
        },
      ],
    });
  expect(response.status).toBe(200);
}

async function deleteAsWeb(id: string): Promise<void> {
  const response = await h.api
    .post('/sync/mutations')
    .set(PROTOCOL)
    .send({
      mutations: [
        {
          ...wireMutation('location.delete', id, {}),
          baseRevision: 1,
        },
      ],
    });
  expect(response.status).toBe(200);
}

async function readGone(id: string) {
  const response = await h.api.get(`/web/locations/${id}/gone`);
  expect(response.status).toBe(200);
  return WebLocationGoneResponseSchema.parse(response.body);
}

describe('GET /web/locations/:id/gone', () => {
  it('returns the deleted location, deletion time, deleter and loose-item count', async () => {
    const locationId = randomUUID();
    const itemIds = Array.from({ length: 7 }, () => randomUUID());
    await apply(
      createLocation(locationId, 'Garage'),
      ...itemIds.map((id) => createItem(id, 'Stored item', { kind: 'location', locationId }))
    );
    await deleteAsDevice(locationId);

    const result = await readGone(locationId);
    const stored = h.db.db
      .select({ deletedAt: locations.deletedAt })
      .from(locations)
      .where(eq(locations.id, locationId))
      .get();

    expect(result).toMatchObject({
      id: locationId,
      name: 'Garage',
      deletedBy: { kind: 'device', label: 'João’s iPhone' },
      inHandCount: 7,
    });
    expect(result.deletedAt).toBe(stored?.deletedAt);
  });

  it('uses the device label for device deletion and Server for web deletion', async () => {
    const deviceLocation = randomUUID();
    const webLocation = randomUUID();
    await apply(
      createLocation(deviceLocation, 'Device garage'),
      createLocation(webLocation, 'Web garage')
    );

    await deleteAsDevice(deviceLocation);
    await deleteAsWeb(webLocation);

    expect((await readGone(deviceLocation)).deletedBy).toEqual({
      kind: 'device',
      label: 'João’s iPhone',
    });
    expect((await readGone(webLocation)).deletedBy).toEqual({ kind: 'web', label: 'Server' });
  });

  it('counts only active items still remembering the deleted location', async () => {
    const locationId = randomUUID();
    const otherLocationId = randomUUID();
    const [storedId, movedId, inactiveId, deletedId] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await apply(
      createLocation(locationId, 'Garage'),
      createLocation(otherLocationId, 'Shed'),
      createItem(storedId, 'Stored item', { kind: 'location', locationId }),
      createItem(movedId, 'Moved item', { kind: 'location', locationId }),
      createItem(inactiveId, 'Inactive item', { kind: 'location', locationId }),
      createItem(deletedId, 'Deleted item', { kind: 'location', locationId })
    );
    await deleteAsDevice(locationId);

    const beforePuttingAway = await readGone(locationId);
    expect(beforePuttingAway.inHandCount).toBe(4);

    await apply({
      ...wireMutation('item.move', movedId, {
        to: { kind: 'location', locationId: otherLocationId },
        verb: 'move',
      }),
      baseRevision: 2,
    });
    h.db.db.update(items).set({ lifecycle: 'retired' }).where(eq(items.id, inactiveId)).run();
    h.db.db
      .update(items)
      .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
      .where(eq(items.id, deletedId))
      .run();

    expect((await readGone(locationId)).inHandCount).toBe(1);
  });

  it('returns zero and no deleter for an empty tombstone without a deletion event', async () => {
    const locationId = randomUUID();
    await apply(createLocation(locationId, 'Empty garage'));
    h.db.db
      .update(locations)
      .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
      .where(eq(locations.id, locationId))
      .run();

    expect(await readGone(locationId)).toMatchObject({
      id: locationId,
      name: 'Empty garage',
      deletedBy: null,
      inHandCount: 0,
    });
  });

  it('returns 404 for live and unknown locations', async () => {
    const liveId = randomUUID();
    await apply(createLocation(liveId, 'Live garage'));

    const liveResponse = await h.api.get(`/web/locations/${liveId}/gone`);
    const unknownResponse = await h.api.get(`/web/locations/${randomUUID()}/gone`);

    expect(liveResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
  });
});
