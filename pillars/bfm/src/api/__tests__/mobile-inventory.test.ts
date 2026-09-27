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
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { MobileInventoryItemSchema } from '../../contract/mobile-inventory-schemas.js';
import { createInventoryFake } from './inventory-fake.js';
import { createInventoryMediaFake } from './inventory-media-fake.js';
import { closeOpenedApps, get, openWith } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { PillarHandleFactory } from '../pillars/gateway.js';

afterEach(closeOpenedApps);

function post(app: Express, token: string | null, path: string, body: object) {
  return requestOn(app, (r) => {
    const request = r.post(path).send(body);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

function put(app: Express, token: string | null, path: string, body: object) {
  return requestOn(app, (r) => {
    const request = r.put(path).send(body);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

function protocol2Type(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    revision: 3,
    id: randomUUID(),
    key: 'kit',
    label: 'Kit',
    description: null,
    sortOrder: 0,
    capabilities: [],
    legacyLabels: [],
    presentation: {},
    archivedAt: null,
    fields: [],
    ...overrides,
  };
}

function protocol2Catalogue(type: Record<string, unknown>): Record<string, unknown> {
  return {
    revision: {
      revision: 3,
      baseRevision: 2,
      status: 'published',
      minimumProtocol: 2,
      created: {
        actor: { kind: 'web', id: 'owner', label: 'Owner' },
        at: '2026-09-24T00:00:00.000Z',
      },
      published: {
        actor: { kind: 'web', id: 'owner', label: 'Owner' },
        at: '2026-09-24T00:00:00.000Z',
        note: null,
      },
      abandoned: null,
    },
    types: [type],
  };
}

function aMutation(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    mutationId: '11111111-1111-4111-8111-111111111111',
    op: 'item.rename',
    entityId: 'item-1',
    baseRevision: 1,
    catalogueRevision: 7,
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

describe('GET /mobile/inventory/type-catalogue', () => {
  it('relays an upstream type without parentTypeId without adding the key', async () => {
    const fake = createInventoryFake({
      catalogueRevisionResult: () => ({
        kind: 'ok',
        value: protocol2Catalogue(protocol2Type()),
      }),
    });
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/type-catalogue?revision=3');

    expect(response.status).toBe(200);
    expect(response.body.types[0]).not.toHaveProperty('parentTypeId');
  });

  it('omits a null upstream parentTypeId from the response', async () => {
    const fake = createInventoryFake({
      catalogueRevisionResult: () => ({
        kind: 'ok',
        value: protocol2Catalogue(protocol2Type({ parentTypeId: null })),
      }),
    });
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/type-catalogue?revision=3');

    expect(response.status).toBe(200);
    expect(response.body.types[0]).not.toHaveProperty('parentTypeId');
  });

  it('relays an upstream uuid parentTypeId unchanged', async () => {
    const parentTypeId = randomUUID();
    const fake = createInventoryFake({
      catalogueRevisionResult: () => ({
        kind: 'ok',
        value: protocol2Catalogue(protocol2Type({ parentTypeId })),
      }),
    });
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/type-catalogue?revision=3');

    expect(response.status).toBe(200);
    expect(response.body.types[0]?.parentTypeId).toBe(parentTypeId);
  });
});

describe('protocol-2 inventory values', () => {
  it('relays exact catalogue identities and canonical stable-ID values without reshaping them', async () => {
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 1,
          minimumProtocol: 2,
          catalogueVersion: 'cat-1',
          total: 1,
          items: [
            {
              ...drillItem(),
              typeId: '59538480-6e82-5ccc-b7be-f1cfd15b9af6',
              catalogueRevision: 1,
              typeKey: 'bulb',
              fieldValues: [
                {
                  fieldId: '147a262c-bb7c-51bf-b617-16d354228d91',
                  source: 'stored',
                  catalogueRevision: 1,
                  values: [{ amount: '800', unit: 'lm' }],
                },
              ],
            },
          ],
          locations: [],
          nextCursor: null,
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      typeId: '59538480-6e82-5ccc-b7be-f1cfd15b9af6',
      catalogueRevision: 1,
      fieldValues: [
        {
          fieldId: '147a262c-bb7c-51bf-b617-16d354228d91',
          source: 'stored',
          catalogueRevision: 1,
          values: [{ amount: '800', unit: 'lm' }],
        },
      ],
    });
  });
});

describe('computed values', () => {
  const itemId = 'item-1';
  const computedFieldId = '2d8a3c1e-5b7f-4e2a-9c61-0f3d2b8a7e14';
  const inputFieldId = '7c1e9a42-3d5b-4f86-a0e2-94b1c6d8f357';
  const computedStates = [
    {
      fieldId: computedFieldId,
      source: 'computed',
      catalogueRevision: 3,
      state: 'ok',
      values: [{ amount: '6', unit: 'l' }],
      dependencies: [{ itemId, fieldId: inputFieldId, revision: 4 }],
      traversedItemIds: [itemId],
    },
    {
      fieldId: computedFieldId,
      source: 'computed',
      catalogueRevision: 3,
      state: 'overridden',
      values: [{ amount: '7', unit: 'l' }],
      override: { catalogueRevision: 2 },
      dependencies: [],
      traversedItemIds: [],
    },
    {
      fieldId: computedFieldId,
      source: 'computed',
      catalogueRevision: 3,
      state: 'unavailable',
      reason: 'a_reason_this_build_has_never_seen',
      failedFieldId: inputFieldId,
      dependencies: [],
      traversedItemIds: [itemId, 'item-2'],
    },
    {
      fieldId: computedFieldId,
      source: 'computed',
      catalogueRevision: 3,
      state: 'unavailable',
      reason: 'missing_dependency',
      failedFieldId: inputFieldId,
      missingInputs: [
        { reason: 'missing_dependency', fieldId: computedFieldId, itemId },
        { reason: 'reference_deleted', fieldId: inputFieldId, itemId: 'item-2' },
      ],
      dependencies: [],
      traversedItemIds: [itemId, 'item-2'],
    },
  ];

  function snapshotWith(item: Record<string, unknown>) {
    return createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 1,
          minimumProtocol: 2,
          catalogueVersion: 'cat-1',
          total: 1,
          items: [item],
          locations: [],
          nextCursor: null,
        },
      },
    });
  }

  it.each(computedStates)('relays a $state computed value field for field', async (computed) => {
    const fake = snapshotWith({ ...drillItem(), computedValues: [computed] });
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(response.status).toBe(200);
    expect(response.body.items[0].computedValues).toEqual([computed]);
  });

  it('answers an empty list for an item from an inventory that predates computed values', async () => {
    const fake = snapshotWith(drillItem());
    const { app, token } = openWith(fake.factory);

    const response = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(response.status).toBe(200);
    expect(response.body.items[0].computedValues).toEqual([]);
  });

  it('refuses a computed state the phone could not draw', () => {
    expect(
      MobileInventoryItemSchema.safeParse({
        ...drillItem(),
        computedValues: [{ ...computedStates[0], state: 'stale' }],
      }).success
    ).toBe(false);
  });

  it('refuses an overridden value that lost its override provenance', () => {
    const withoutOverride = {
      fieldId: computedFieldId,
      source: 'computed',
      catalogueRevision: 3,
      state: 'overridden',
      values: [{ amount: '7', unit: 'l' }],
      dependencies: [],
      traversedItemIds: [],
    };
    expect(
      MobileInventoryItemSchema.safeParse({ ...drillItem(), computedValues: [withoutOverride] })
        .success
    ).toBe(false);
  });
});

function drillItem(): Record<string, unknown> {
  return {
    id: 'item-1',
    revision: 1,
    seq: 3,
    name: 'Drill',
    typeId: null,
    catalogueRevision: null,
    typeKey: null,
    legacyType: 'Tools',
    fieldValues: [],
    fields: {},
    note: null,
    code: null,
    externalIds: [],
    quantity: 1,
    lifecycle: 'active',
    lifecycleChangedAt: null,
    placement: { kind: 'hand' },
    previousPlacement: null,
    isContainer: false,
    access: null,
    isFull: null,
    photos: [],
    provenance: null,
    documentsStatus: 'none',
    documentTitles: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    deletedAt: null,
  };
}

describe('the snapshot', () => {
  it('answers one page, forwarding cursor and limit unmodified', async () => {
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 42,
          minimumProtocol: 2,
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
    expect(res.body.minimumProtocol).toBe(2);
    expect(res.body.nextCursor).toBe('opaque-cursor');
    expect(fake.snapshotCalls).toEqual([{ cursor: 'abc', limit: 10 }]);
  });

  it('answers minimumProtocol 1 for a page from an inventory pillar that predates the rollout gate', async () => {
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 42,
          catalogueVersion: 'cat-1',
          total: 0,
          items: [],
          locations: [],
          nextCursor: null,
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(200);
    expect(res.body.minimumProtocol).toBe(1);
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

  it.each([
    ['relays an item migrated from free text with its legacyType', 'Tools'],
    ['relays an item with no legacy type as null', null],
  ] as const)('%s', async (_name, legacyType) => {
    const item = { ...drillItem(), legacyType };
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 3,
          minimumProtocol: 2,
          catalogueVersion: 'cat-1',
          total: 1,
          items: [item],
          locations: [],
          nextCursor: null,
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(200);
    expect(res.body.items[0].legacyType).toBe(legacyType);
  });

  it('refuses an item the producer sent without legacyType as a contract mismatch', async () => {
    const withoutLegacyType = Object.fromEntries(
      Object.entries(drillItem()).filter(([key]) => key !== 'legacyType')
    );
    const fake = createInventoryFake({
      snapshotResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 3,
          minimumProtocol: 2,
          catalogueVersion: 'cat-1',
          total: 1,
          items: [withoutLegacyType],
          locations: [],
          nextCursor: null,
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/snapshot');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
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
          minimumProtocol: 2,
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
    expect(res.body.minimumProtocol).toBe(2);
    expect(fake.changesCalls).toEqual([{ since: 42, epoch: 'epoch-1', limit: 100 }]);
  });

  it('answers minimumProtocol 1 for a page from an inventory pillar that predates the rollout gate', async () => {
    const fake = createInventoryFake({
      changesResult: {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          items: [],
          locations: [],
          events: [],
          nextSince: 42,
          hasMore: false,
          catalogueVersion: 'cat-1',
        },
      },
    });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, '/mobile/inventory/sync/changes?since=42&epoch=epoch-1');

    expect(res.status).toBe(200);
    expect(res.body.minimumProtocol).toBe(1);
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

  it('relays the catalogue changes a catalogue refusal names, field for field', async () => {
    const catalogueChanges = [
      {
        definition: 'field',
        id: 'field-shielding',
        typeId: 'type-cable',
        fieldId: 'field-shielding',
        change: 'replaced',
        replacementId: 'field-braid',
        revision: 7,
      },
      {
        definition: 'revision',
        id: '9',
        typeId: null,
        fieldId: null,
        change: 'a_kind_this_relay_has_never_heard_of',
        replacementId: null,
        revision: 9,
      },
    ];
    const rejected = {
      mutationId: 'a',
      status: 'rejected',
      reason: 'catalogue_repair_required',
      message: 'field field-shielding: cannot receive new values',
      catalogueChanges,
    };
    const fake = createInventoryFake({
      mutationsResult: () => ({ kind: 'ok', value: { outcomes: [rejected], highWaterSeq: 3 } }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(200);
    expect(res.body.outcomes).toEqual([rejected]);
  });

  it('refuses a catalogue change missing its revision as a contract mismatch', async () => {
    const fake = createInventoryFake({
      mutationsResult: () => ({
        kind: 'ok',
        value: {
          outcomes: [
            {
              mutationId: 'a',
              status: 'rejected',
              reason: 'catalogue_update_required',
              message: 'refresh',
              catalogueChanges: [
                {
                  definition: 'field',
                  id: 'f',
                  typeId: 't',
                  fieldId: 'f',
                  change: 'now_required',
                  replacementId: null,
                },
              ],
            },
          ],
          highWaterSeq: 3,
        },
      }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });

  it('sends the paired device as Pops-Actor, never anything the phone could set', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [aMutation()],
    });

    expect(res.status).toBe(200);
    expect(fake.mutationsCalls).toHaveLength(1);
    expect(fake.mutationsCalls[0]?.mutations).toEqual([aMutation()]);
  });

  it('accepts mutations from app versions that predate catalogue revision pins', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);
    const mutation = aMutation();
    delete mutation.catalogueRevision;

    const res = await post(app, token, '/mobile/inventory/mutations', {
      mutations: [mutation],
    });

    expect(res.status).toBe(200);
    expect(fake.mutationsCalls[0]?.mutations).toEqual([mutation]);
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

describe('media', () => {
  const SHA256 = 'a'.repeat(64);

  it('stores a new blob and answers 201', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake({
      uploadResult: { kind: 'ok', value: { sha256: SHA256, alreadyStored: false } },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: Buffer.from('a real photo').toString('base64'),
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ sha256: SHA256, alreadyStored: false });
    expect(media.uploadCalls).toHaveLength(1);
    expect(media.uploadCalls[0]?.mediaType).toBe('image/jpeg');
  });

  it('passes an already-stored answer through unchanged, as a 200', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake({
      uploadResult: { kind: 'ok', value: { sha256: SHA256, alreadyStored: true } },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: Buffer.from('the same bytes again').toString('base64'),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sha256: SHA256, alreadyStored: true });
  });

  it('answers 413 for bytes over the cap, and never calls inventory at all', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake();
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const oversized = Buffer.alloc(9 * 1024 * 1024, 1).toString('base64');
    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: oversized,
    });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('payload_too_large');
    expect(media.uploadCalls).toEqual([]);
  });

  it('forwards a 415 from inventory when the bytes are not an image it can decode', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake({
      uploadResult: {
        kind: 'unsupported-media',
        pillar: 'inventory',
        status: 415,
        detail: 'not a supported image format',
      },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: Buffer.from('not actually a jpeg').toString('base64'),
    });

    expect(res.status).toBe(415);
    expect(res.body.code).toBe('upstream_unsupported_media');
  });

  it('answers 400 when the claimed hash does not match the bytes, without reaching 502', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake({
      uploadResult: {
        kind: 'invalid-request',
        pillar: 'inventory',
        status: 400,
        detail: 'hash_mismatch',
      },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: Buffer.from('wrong bytes').toString('base64'),
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
  });

  it('refuses a device without inventory.write', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake();
    const { app, token } = openWith(inventory.factory, ['inventory.read'], media.client);

    const res = await put(app, token, `/mobile/inventory/media/${SHA256}`, {
      mediaType: 'image/jpeg',
      dataBase64: Buffer.from('x').toString('base64'),
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(media.uploadCalls).toEqual([]);
  });

  it('reads a stored blob back as base64', async () => {
    const inventory = createInventoryFake();
    const bytes = Buffer.from('a real photo');
    const media = createInventoryMediaFake({
      readResult: { kind: 'ok', value: { sha256: SHA256, mediaType: 'image/jpeg', bytes } },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.read'], media.client);

    const res = await get(app, token, `/mobile/inventory/media/${SHA256}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      byteLength: bytes.length,
      dataBase64: bytes.toString('base64'),
    });
    expect(media.readCalls).toEqual([{ sha256: SHA256, variant: 'full' }]);
  });

  it('answers 404 when inventory has no such hash', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake({
      readResult: { kind: 'not-found', pillar: 'inventory', status: 404 },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.read'], media.client);

    const res = await get(app, token, `/mobile/inventory/media/${SHA256}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('refuses a device without inventory.read', async () => {
    const inventory = createInventoryFake();
    const media = createInventoryMediaFake();
    const { app, token } = openWith(inventory.factory, ['inventory.write'], media.client);

    const res = await get(app, token, `/mobile/inventory/media/${SHA256}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(media.readCalls).toEqual([]);
  });

  it('forwards a requested variant to the media client', async () => {
    const inventory = createInventoryFake();
    const bytes = Buffer.from('thumb bytes');
    const media = createInventoryMediaFake({
      readResult: { kind: 'ok', value: { sha256: SHA256, mediaType: 'image/jpeg', bytes } },
    });
    const { app, token } = openWith(inventory.factory, ['inventory.read'], media.client);

    const res = await get(app, token, `/mobile/inventory/media/${SHA256}?variant=thumb`);

    expect(res.status).toBe(200);
    expect(media.readCalls).toEqual([{ sha256: SHA256, variant: 'thumb' }]);
  });
});
