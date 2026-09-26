import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

    expect(withoutSince).toMatchObject({ headSeq: 1, groups: [] });
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

    expect(await head(target)).toEqual({ headSeq: 0, groups: [] });
  });
});
