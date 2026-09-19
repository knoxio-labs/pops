/**
 * The `/mobile/inventory/*` read routes, end to end through the real app, the
 * real gateway and the real wire validation — with only inventory's network
 * replaced (`inventory-fake.ts`, mirroring `purchases-read-fake.ts`).
 *
 * What this suite defends that a unit test on `client.ts` cannot:
 *
 * - the capability gate (a device without `inventory.read` is refused);
 * - `409`/`426` reach the phone as the sync protocol's own shapes, not folded
 *   into the generic upstream-error vocabulary every other pillar gets;
 * - a producer answer that does not match the wire contract is a `502`, never
 *   data.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileInventoryClient } from '../inventory/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createTestApp, type TestApp } from './harness.js';
import { createInventoryFake } from './inventory-fake.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { MobileCapability } from '../../contract/capabilities.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(
  factory: PillarHandleFactory,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES
): { app: Express; token: string } {
  const created = createTestApp({
    inventory: createMobileInventoryClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function get(app: Express, token: string | null, path: string) {
  return requestOn(app, (r) => {
    const request = r.get(path);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

function post(app: Express, token: string | null, path: string, body: object) {
  return requestOn(app, (r) => {
    const request = r.post(path).send(body);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

function aMutation(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    mutationId: '11111111-1111-4111-8111-111111111111',
    op: 'item.rename',
    entityId: 'item-1',
    baseRevision: 1,
    dependsOn: [],
    clientTime: '2026-09-19T00:00:00.000Z',
    args: { name: 'New name' },
    ...overrides,
  };
}

describe('the catalogue', () => {
  it('answers the type catalogue', async () => {
    const fake = createInventoryFake({
      catalogueResult: {
        kind: 'ok',
        value: {
          version: 'cat-7',
          units: [{ symbol: 'kg', dimension: 'mass', multiplier: 1 }],
          types: [
            {
              key: 'box',
              name: 'Box',
              capabilities: ['containment'],
              fields: [{ key: 'weight', label: 'Weight', kind: 'measurement', dimension: 'mass' }],
              legacyLabels: [],
            },
          ],
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/types');

    expect(res.status).toBe(200);
    expect(res.body.version).toBe('cat-7');
    expect(res.body.types[0].key).toBe('box');
    expect(fake.catalogueCalls).toBe(1);
  });
});

describe('the snapshot', () => {
  it('answers one page, forwarding cursor and limit unmodified', async () => {
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 42,
          catalogueVersion: 'cat-1',
          total: 1,
          items: [],
          locations: [],
          nextCursor: 'opaque-cursor',
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot?cursor=abc&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.highWaterSeq).toBe(42);
    expect(res.body.nextCursor).toBe('opaque-cursor');
    expect(fake.snapshotCalls).toEqual([{ cursor: 'abc', limit: 10 }]);
  });

  it('maps a rotated-epoch conflict to 409 resync_required, not the generic upstream-conflict fold', async () => {
    const fake = createInventoryFake({
      snapshotResult: { kind: 'conflict', pillar: 'inventory', message: 'epoch rotated' },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('resync_required');
  });

  it('maps a foreign cursor to 400 invalid_cursor, not the generic upstream-invalid-request fold', async () => {
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'bad-request',
        pillar: 'inventory',
        message: 'cursor not issued here',
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot?cursor=not-mine');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_cursor');
  });

  it('answers 426 when this build sends a protocol inventory no longer serves', async () => {
    const fake = createInventoryFake({
      snapshotResult: { kind: 'refused', pillar: 'inventory', status: 426, message: 'too old' },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(426);
    expect(res.body.code).toBe('client_too_old');
  });

  it('reports a producer answer that does not match the wire contract as a mismatch, not as data', async () => {
    const malformed: PillarHandleFactory = <TRouter>() =>
      ({
        sync: {
          snapshot: () => Promise.resolve({ kind: 'ok', value: { total: 'not-a-number' } }),
          changes: () => Promise.resolve({ kind: 'ok', value: {} }),
          itemEvents: () => Promise.resolve({ kind: 'ok', value: {} }),
        },
        types: { catalogue: () => Promise.resolve({ kind: 'ok', value: {} }) },
      }) as TRouter;
    const { app, token } = openWith(malformed);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });

  it('refuses a device that never held inventory.read', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['session.read']);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(res.body.capability).toBe('inventory.read');
  });

  it('refuses a caller carrying no token', async () => {
    const fake = createInventoryFake();
    const { app } = openWith(fake.factory);

    const res = await get(app, null, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(401);
  });
});

describe('the change feed', () => {
  it('answers a page, forwarding since and epoch unmodified', async () => {
    const fake = createInventoryFake({
      changesResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          items: [],
          locations: [],
          events: [],
          nextSince: 99,
          hasMore: true,
          catalogueVersion: 'cat-1',
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/changes?since=42&epoch=epoch-1');

    expect(res.status).toBe(200);
    expect(res.body.nextSince).toBe(99);
    expect(res.body.hasMore).toBe(true);
    expect(fake.changesCalls).toEqual([{ since: 42, epoch: 'epoch-1', limit: 100 }]);
  });

  it('maps a foreign or rotated epoch to 409 resync_required', async () => {
    const fake = createInventoryFake({
      changesResult: { kind: 'conflict', pillar: 'inventory', message: 'unknown epoch' },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/changes?since=0&epoch=stale');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('resync_required');
  });

  it('rejects a request missing since or epoch before ever reaching inventory', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/changes');

    expect(res.status).toBe(400);
    expect(fake.changesCalls).toEqual([]);
  });
});

describe("one item's history", () => {
  it('answers the events, newest first, as the producer sent them', async () => {
    const fake = createInventoryFake({
      itemEventsResult: {
        'item-1': {
          kind: 'ok',
          value: {
            events: [
              {
                seq: 5,
                entityKind: 'item',
                entityId: 'item-1',
                kind: 'edited',
                fields: ['name'],
                before: { name: 'Old' },
                after: { name: 'New' },
                reason: null,
                actor: { kind: 'device', label: 'Joao’s iPhone' },
                clientTime: null,
                serverTime: '2026-09-19T00:00:00.000Z',
                compensatesSeq: null,
                undoable: true,
              },
            ],
            nextCursor: null,
          },
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/items/item-1/history');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].kind).toBe('edited');
    expect(fake.itemEventsCalls).toEqual([{ id: 'item-1', cursor: undefined, limit: 50 }]);
  });

  it('answers 404 for an item this replica has never heard of', async () => {
    const fake = createInventoryFake({ itemEventsResult: {} });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/items/missing/history');

    expect(res.status).toBe(404);
  });

  it('maps a foreign history cursor to 400 invalid_cursor', async () => {
    const fake = createInventoryFake({
      itemEventsResult: {
        'item-1': { kind: 'bad-request', pillar: 'inventory', message: 'not this item’s cursor' },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/items/item-1/history?cursor=wrong');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_cursor');
  });
});

describe('mutations', () => {
  it('passes every per-mutation outcome through unchanged, in order', async () => {
    const fake = createInventoryFake({
      mutationsResult: () => ({
        kind: 'ok',
        value: {
          outcomes: [
            {
              mutationId: 'a',
              status: 'applied',
              revision: 2,
              seq: 10,
              converged: true,
            },
            {
              mutationId: 'b',
              status: 'conflict',
              kind: 'code_collision',
              heldBy: { id: 'item-9', name: 'Existing box' },
              suggestedCode: 'BOX-2',
            },
            { mutationId: 'c', status: 'rejected', reason: 'invalid', message: 'bad op' },
            { mutationId: 'd', status: 'deferred', waitingOn: 'a' },
          ],
          highWaterSeq: 10,
        },
      }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(200);
    expect(res.body.highWaterSeq).toBe(10);
    expect(res.body.outcomes).toEqual([
      { mutationId: 'a', status: 'applied', revision: 2, seq: 10, converged: true },
      {
        mutationId: 'b',
        status: 'conflict',
        kind: 'code_collision',
        heldBy: { id: 'item-9', name: 'Existing box' },
        suggestedCode: 'BOX-2',
      },
      { mutationId: 'c', status: 'rejected', reason: 'invalid', message: 'bad op' },
      { mutationId: 'd', status: 'deferred', waitingOn: 'a' },
    ]);
  });

  it('sends the paired device as Pops-Actor, never anything the phone could set', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(200);
    expect(fake.mutationsCalls).toHaveLength(1);
    expect(fake.mutationsCalls[0]?.mutations).toHaveLength(1);
  });

  it('refuses a batch above the 256KB cap before it ever reaches inventory', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation({ args: { note: 'x'.repeat(300 * 1024) } })],
    });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'payload_too_large',
      maxBytes: 256 * 1024,
      message: expect.any(String),
    });
    expect(fake.mutationsCalls).toEqual([]);
  });

  it('refuses a device without inventory.write', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(res.body.capability).toBe('inventory.write');
    expect(fake.mutationsCalls).toEqual([]);
  });

  it('answers 426 when this build sends a protocol inventory no longer serves', async () => {
    const fake = createInventoryFake({
      mutationsResult: () => ({
        kind: 'refused',
        pillar: 'inventory',
        status: 426,
        message: 'old',
      }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(426);
    expect(res.body.code).toBe('client_too_old');
  });
});

describe('code suggestions', () => {
  it('forwards the name, type and stem, and answers the suggestions unchanged', async () => {
    const fake = createInventoryFake({
      suggestResult: { kind: 'ok', value: { suggestions: ['BOX-1', 'BOX-2'] } },
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/codes/suggest', {
      name: 'A new box',
      typeKey: 'box',
      stem: 'BOX',
    });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual(['BOX-1', 'BOX-2']);
    expect(fake.suggestCalls).toEqual([{ name: 'A new box', typeKey: 'box', stem: 'BOX' }]);
  });

  it('refuses a device without inventory.write', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await post(app, token, '/mobile/inventory/codes/suggest', { name: 'A new box' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(res.body.capability).toBe('inventory.write');
  });

  it('rejects an empty name before ever reaching inventory', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/codes/suggest', { name: '' });

    expect(res.status).toBe(400);
    expect(fake.suggestCalls).toEqual([]);
  });
});
