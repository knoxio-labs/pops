import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ItemConnectionSchema } from '../../contract/rest-connections.js';
import { FixtureSchema, ItemFixtureConnectionSchema } from '../../contract/rest-fixtures.js';
import { WebChangesHeadResponseSchema } from '../../contract/rest-web-changes.js';
import {
  createItem,
  createLocation,
  granting,
  openSyncHarness,
  PROTOCOL,
  send,
  SYNC_KEY,
  wireMutation,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  vi.useRealTimers();
  h?.close();
  h = undefined;
});

function harness(): SyncHarness {
  h = openSyncHarness(transport, { verify: granting(['inventory.sync']) });
  return h;
}

function deviceHeaders(id: string, label: string): Record<string, string> {
  return {
    ...PROTOCOL,
    'x-api-key': SYNC_KEY,
    'Pops-Actor': `device:${id};label=${encodeURIComponent(label)}`,
  };
}

async function applyWeb(target: SyncHarness, ...mutations: ReturnType<typeof wireMutation>[]) {
  const response = await send(target.api, mutations);
  expect(response.status).toBe(200);
}

async function applyDevice(
  target: SyncHarness,
  id: string,
  label: string,
  ...mutations: ReturnType<typeof wireMutation>[]
) {
  const response = await send(target.api, mutations, deviceHeaders(id, label));
  expect(response.status).toBe(200);
}

async function createFixture(target: SyncHarness, name: string) {
  const response = await target.api.post('/fixtures').send({ name, type: 'power' });
  expect(response.status).toBe(201);
  return FixtureSchema.parse(response.body.data);
}

async function connectItems(target: SyncHarness, itemAId: string, itemBId: string) {
  const response = await target.api.post('/connections').send({ itemAId, itemBId });
  expect(response.status).toBe(201);
  return ItemConnectionSchema.parse(response.body.data);
}

async function connectFixture(target: SyncHarness, itemId: string, fixtureId: string) {
  const response = await target.api.post(`/items/${itemId}/fixtures/${fixtureId}`).send({});
  expect(response.status).toBe(201);
  return ItemFixtureConnectionSchema.parse(response.body.data);
}

async function head(
  target: SyncHarness,
  query: { since?: number; entityId?: string } = {}
): Promise<ReturnType<typeof WebChangesHeadResponseSchema.parse>> {
  const response = await target.api.get('/web/changes/head').query(query);
  expect(response.status).toBe(200);
  return WebChangesHeadResponseSchema.parse(response.body);
}

describe('GET /web/changes/head', () => {
  it('returns the head and no groups without since', async () => {
    const target = harness();
    await applyWeb(target, createItem(randomUUID(), 'Lamp'));

    const withoutSince = await head(target);
    const atHead = await head(target, { since: withoutSince.headSeq });

    expect(withoutSince).toMatchObject({ headSeq: 1, groups: [], connectionsChangedAt: null });
    expect(atHead).toEqual(withoutSince);
  });

  it('groups device changes after since by device with counts and latest time', async () => {
    const target = harness();
    const locationId = randomUUID();
    const itemIds = [randomUUID(), randomUUID(), randomUUID()];
    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      createLocation(locationId, 'Garage'),
      ...itemIds.map((id) => createItem(id, `Item ${id}`))
    );
    const since = (await head(target)).headSeq;

    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      ...itemIds.map((entityId) =>
        wireMutation(
          'item.move',
          entityId,
          { to: { kind: 'location', locationId }, verb: 'move' },
          { baseRevision: 1 }
        )
      )
    );

    const result = await head(target, { since });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      actorKind: 'device',
      actorId: 'phone-1',
      actorLabel: "Joao's iPhone",
      eventCount: 3,
      entityCount: 3,
      kindCounts: { moved: 3 },
      latestServerTime: expect.any(String),
    });
  });

  it('a location change after since is grouped like an item change', async () => {
    const target = harness();
    const locationId = randomUUID();
    await applyWeb(target, createLocation(locationId, 'Garage'));
    const since = (await head(target)).headSeq;

    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      wireMutation('location.rename', locationId, { name: 'Workshop' }, { baseRevision: 1 })
    );

    const result = await head(target, { since });
    expect(result.groups).toEqual([
      expect.objectContaining({
        actorKind: 'device',
        actorId: 'phone-1',
        actorLabel: "Joao's iPhone",
        eventCount: 1,
        entityCount: 1,
        kindCounts: { edited: 1 },
      }),
    ]);
  });

  it('two devices group separately, newest first', async () => {
    const target = harness();
    const itemIds = [randomUUID(), randomUUID()];
    await applyWeb(target, ...itemIds.map((id, index) => createItem(id, `Item ${index + 1}`)));
    const since = (await head(target)).headSeq;

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T05:00:00.000Z'));
    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      wireMutation('item.edit', itemIds[0]!, { name: 'First edit' }, { baseRevision: 1 })
    );
    vi.setSystemTime(new Date('2026-09-26T05:01:00.000Z'));
    await applyDevice(
      target,
      'tablet-1',
      "Joao's iPad",
      wireMutation('item.edit', itemIds[1]!, { name: 'Second edit' }, { baseRevision: 1 })
    );

    const result = await head(target, { since });
    expect(result.groups.map((group) => group.actorId)).toEqual(['tablet-1', 'phone-1']);
  });

  it('web changes are excluded', async () => {
    const target = harness();
    const itemId = randomUUID();
    await applyWeb(target, createItem(itemId, 'Lamp'));
    const since = (await head(target)).headSeq;

    await applyWeb(
      target,
      wireMutation('item.edit', itemId, { name: 'Desk lamp' }, { baseRevision: 1 })
    );

    const result = await head(target, { since });
    expect(result.groups).toEqual([]);
    expect(result.headSeq).toBeGreaterThan(since);
  });

  it('entityId narrows to one entity', async () => {
    const target = harness();
    const itemIds = [randomUUID(), randomUUID()];
    await applyWeb(target, ...itemIds.map((id, index) => createItem(id, `Item ${index + 1}`)));
    const since = (await head(target)).headSeq;

    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      wireMutation('item.edit', itemIds[0]!, { name: 'First edit' }, { baseRevision: 1 }),
      wireMutation('item.edit', itemIds[1]!, { name: 'Second edit' }, { baseRevision: 1 })
    );

    const result = await head(target, { since, entityId: itemIds[1] });
    expect(result.groups).toEqual([
      expect.objectContaining({
        actorId: 'phone-1',
        eventCount: 1,
        entityCount: 1,
        kindCounts: { edited: 1 },
      }),
    ]);
  });

  it('returns connection and fixture change times for every query shape', async () => {
    const target = harness();
    const itemA = randomUUID();
    const itemB = randomUUID();
    await applyWeb(target, createItem(itemA, 'Lamp'), createItem(itemB, 'Outlet'));
    const initial = await head(target);
    expect(initial.connectionsChangedAt).toBeNull();

    vi.useFakeTimers({ toFake: ['Date'] });
    const connectionCreatedAt = new Date('2026-09-27T00:00:00.000Z');
    vi.setSystemTime(connectionCreatedAt);
    await connectItems(target, itemA, itemB);
    const afterConnection = await head(target);
    expect(afterConnection).toMatchObject({
      headSeq: initial.headSeq,
      groups: [],
      connectionsChangedAt: connectionCreatedAt.toISOString(),
    });

    const connectionDeletedAt = new Date('2026-09-27T00:01:00.000Z');
    vi.setSystemTime(connectionDeletedAt);
    await target.api.delete('/connections').query({ itemAId: itemA, itemBId: itemB }).send({});
    expect((await head(target)).connectionsChangedAt).toBe(connectionDeletedAt.toISOString());

    const fixtureCreatedAt = new Date('2026-09-27T00:02:00.000Z');
    vi.setSystemTime(fixtureCreatedAt);
    const fixture = await createFixture(target, 'Wall outlet');
    expect((await head(target)).connectionsChangedAt).toBe(fixtureCreatedAt.toISOString());

    const fixtureUpdatedAt = new Date('2026-09-27T00:03:00.000Z');
    vi.setSystemTime(fixtureUpdatedAt);
    const updated = await target.api.patch(`/fixtures/${fixture.id}`).send({ name: 'Desk outlet' });
    expect(updated.status).toBe(200);
    expect((await head(target)).connectionsChangedAt).toBe(fixtureUpdatedAt.toISOString());

    const fixtureConnectedAt = new Date('2026-09-27T00:04:00.000Z');
    vi.setSystemTime(fixtureConnectedAt);
    await connectFixture(target, itemA, fixture.id);
    expect((await head(target)).connectionsChangedAt).toBe(fixtureConnectedAt.toISOString());

    const fixtureDisconnectedAt = new Date('2026-09-27T00:05:00.000Z');
    vi.setSystemTime(fixtureDisconnectedAt);
    const disconnected = await target.api.delete(`/items/${itemA}/fixtures/${fixture.id}`).send({});
    expect(disconnected.status).toBe(200);
    expect((await head(target)).connectionsChangedAt).toBe(fixtureDisconnectedAt.toISOString());

    const fixtureDeletedAt = new Date('2026-09-27T00:06:00.000Z');
    vi.setSystemTime(fixtureDeletedAt);
    const deleted = await target.api.delete(`/fixtures/${fixture.id}`).send({});
    expect(deleted.status).toBe(200);

    const final = await head(target, { since: initial.headSeq, entityId: itemB });
    expect(final).toEqual({
      headSeq: initial.headSeq,
      groups: [],
      connectionsChangedAt: fixtureDeletedAt.toISOString(),
    });
  });

  it('an item move advances headSeq without changing connectionsChangedAt', async () => {
    const target = harness();
    const itemId = randomUUID();
    const locationId = randomUUID();
    await applyWeb(target, createLocation(locationId, 'Garage'), createItem(itemId, 'Lamp'));

    vi.useFakeTimers({ toFake: ['Date'] });
    const fixtureChangedAt = new Date('2026-09-27T00:00:00.000Z');
    vi.setSystemTime(fixtureChangedAt);
    await createFixture(target, 'Wall outlet');
    const beforeMove = await head(target);

    vi.setSystemTime(new Date('2026-09-27T00:01:00.000Z'));
    await applyDevice(
      target,
      'phone-1',
      "Joao's iPhone",
      wireMutation(
        'item.move',
        itemId,
        { to: { kind: 'location', locationId }, verb: 'move' },
        { baseRevision: 1 }
      )
    );

    const afterMove = await head(target);
    expect(afterMove.headSeq).toBeGreaterThan(beforeMove.headSeq);
    expect(afterMove.connectionsChangedAt).toBe(fixtureChangedAt.toISOString());
  });

  it('since ahead of head is a 400', async () => {
    const target = harness();
    const response = await target.api.get('/web/changes/head').query({ since: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'ValidationError',
      message: 'since is ahead of the head',
    });
  });

  it('an empty database has head 0', async () => {
    const target = harness();

    expect(await head(target)).toEqual({ headSeq: 0, groups: [], connectionsChangedAt: null });
  });
});
