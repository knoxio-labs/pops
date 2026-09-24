/**
 * Computed-field values on the sync and web item wire: one `computedValues`
 * entry per computed field, `ok`, `overridden` or `unavailable`, re-evaluated
 * when a dependency changes, and never leaked into the protocol-1 `fields`.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  publishComputedType,
  type ComputedCatalogue,
} from '../../catalogue/__tests__/computed-catalogue-fixture.js';
import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import {
  openSyncHarness,
  PROTOCOL_2,
  send,
  wireMutation,
  type SyncHarness,
  type WireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { z } from 'zod';

type SyncItem = z.infer<typeof SyncItemSchema>;

const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
});

async function apply(target: SyncHarness, mutation: WireMutation): Promise<void> {
  const response = await send(target.api, [mutation], PROTOCOL_2);
  expect(response.status).toBe(200);
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
}

async function setup(): Promise<{
  target: SyncHarness;
  catalogue: ComputedCatalogue;
  itemId: string;
}> {
  h = openSyncHarness(transport);
  const catalogue = publishComputedType(h.db.db);
  const itemId = randomUUID();
  await apply(
    h,
    wireMutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Box',
          typeId: catalogue.typeId,
          values: [{ fieldId: catalogue.inputFieldId, values: [4] }],
        },
      },
      { catalogueRevision: catalogue.revision }
    )
  );
  return { target: h, catalogue, itemId };
}

async function snapshotItem(target: SyncHarness, itemId: string): Promise<SyncItem> {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL_2);
  expect(response.status).toBe(200);
  const item = SyncItemSchema.array()
    .parse(response.body.items)
    .find((row) => row.id === itemId);
  if (item === undefined) throw new Error(`snapshot lacks ${itemId}`);
  return item;
}

function computedOf(item: SyncItem, fieldId: string) {
  return item.computedValues.find((entry) => entry.fieldId === fieldId);
}

describe('computed values on the sync wire', () => {
  it('carries an evaluated value with its dependencies and traversed items', async () => {
    const { target, catalogue, itemId } = await setup();

    const item = await snapshotItem(target, itemId);

    expect(computedOf(item, catalogue.computedFieldId)).toEqual({
      fieldId: catalogue.computedFieldId,
      source: 'computed',
      catalogueRevision: catalogue.revision,
      state: 'ok',
      values: [8],
      dependencies: [{ itemId, fieldId: catalogue.inputFieldId, revision: 1 }],
      traversedItemIds: [itemId],
    });
    expect(item.computedValues.map((entry) => entry.fieldId).toSorted()).toEqual(
      [catalogue.computedFieldId, catalogue.lockedFieldId].toSorted()
    );
  });

  it('reports an override as overridden, with the revision it was written against', async () => {
    const { target, catalogue, itemId } = await setup();
    await apply(
      target,
      wireMutation(
        'item.setOverride',
        itemId,
        { fieldId: catalogue.computedFieldId, values: [99] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );

    const item = await snapshotItem(target, itemId);

    expect(computedOf(item, catalogue.computedFieldId)).toEqual({
      fieldId: catalogue.computedFieldId,
      source: 'computed',
      catalogueRevision: catalogue.revision,
      state: 'overridden',
      values: [99],
      override: { catalogueRevision: catalogue.revision },
      dependencies: [],
      traversedItemIds: [],
    });
    expect(computedOf(item, catalogue.lockedFieldId)).toMatchObject({ state: 'ok', values: [8] });
    expect(item.fieldValues).toContainEqual({
      fieldId: catalogue.computedFieldId,
      source: 'override',
      catalogueRevision: catalogue.revision,
      values: [99],
    });
  });

  it('reports a missing dependency as unavailable, naming the field that blocked it', async () => {
    const { target, catalogue, itemId } = await setup();
    target.db.raw
      .prepare('DELETE FROM item_field_values WHERE item_id = ? AND field_id = ?')
      .run(itemId, catalogue.inputFieldId);

    const item = await snapshotItem(target, itemId);

    expect(computedOf(item, catalogue.computedFieldId)).toEqual({
      fieldId: catalogue.computedFieldId,
      source: 'computed',
      catalogueRevision: catalogue.revision,
      state: 'unavailable',
      reason: 'missing_dependency',
      failedFieldId: catalogue.inputFieldId,
      dependencies: [],
      traversedItemIds: [itemId],
    });
  });

  it('re-evaluates after a dependency edit instead of serving the cached value', async () => {
    const { target, catalogue, itemId } = await setup();
    expect(computedOf(await snapshotItem(target, itemId), catalogue.computedFieldId)).toMatchObject(
      { values: [8] }
    );

    await apply(
      target,
      wireMutation(
        'item.edit',
        itemId,
        { values: [{ fieldId: catalogue.inputFieldId, values: [5] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );

    expect(computedOf(await snapshotItem(target, itemId), catalogue.computedFieldId)).toMatchObject(
      {
        state: 'ok',
        values: [10],
        dependencies: [{ itemId, fieldId: catalogue.inputFieldId, revision: 2 }],
      }
    );
  });

  it('clearing an override resumes evaluation on the next read', async () => {
    const { target, catalogue, itemId } = await setup();
    const override = { baseRevision: 1, catalogueRevision: catalogue.revision };
    await apply(
      target,
      wireMutation(
        'item.setOverride',
        itemId,
        { fieldId: catalogue.computedFieldId, values: [99] },
        override
      )
    );
    await apply(
      target,
      wireMutation(
        'item.clearOverride',
        itemId,
        { fieldId: catalogue.computedFieldId },
        { ...override, baseRevision: 2 }
      )
    );

    const item = await snapshotItem(target, itemId);

    expect(computedOf(item, catalogue.computedFieldId)).toMatchObject({ state: 'ok', values: [8] });
    expect(item.fieldValues.some((entry) => entry.source === 'override')).toBe(false);
  });

  it('keeps computed and override values out of the protocol-1 fields projection', async () => {
    const { target, catalogue, itemId } = await setup();
    await apply(
      target,
      wireMutation(
        'item.setOverride',
        itemId,
        { fieldId: catalogue.computedFieldId, values: [99] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );

    const item = await snapshotItem(target, itemId);

    expect(Object.keys(item.fields)).not.toContain('computed');
    expect(Object.keys(item.fields)).not.toContain('locked');
    expect(JSON.stringify(item.fields)).not.toContain('99');
  });

  it('gives an untyped item no computed values', async () => {
    h = openSyncHarness(transport);
    publishComputedType(h.db.db);
    const itemId = randomUUID();
    await apply(h, wireMutation('item.create', itemId, { item: { name: 'Loose' } }));

    expect((await snapshotItem(h, itemId)).computedValues).toEqual([]);
  });
});

describe('computed values on the web item wire', () => {
  it('carries the same entries on the item detail', async () => {
    const { target, catalogue, itemId } = await setup();

    const response = await target.api.get(`/web/items/${itemId}`);

    expect(response.status).toBe(200);
    const item = SyncItemSchema.parse(response.body.item);
    expect(computedOf(item, catalogue.computedFieldId)).toMatchObject({
      state: 'ok',
      values: [8],
    });
  });
});
