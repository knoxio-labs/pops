import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  publishComputedType,
  type ComputedCatalogue,
} from '../../../catalogue/__tests__/computed-catalogue-fixture.js';
import {
  loadPublishedCatalogue,
  readEffectiveItemFieldValues,
  readItemFieldValues,
} from '../../../catalogue/index.js';
import { mutation, openHarness } from './test-utils.js';

import type { Harness } from './test-utils.js';

function createWith(
  harness: Harness,
  catalogue: ComputedCatalogue,
  extra: readonly { fieldId: string; source?: string; values: unknown[] }[]
): { readonly itemId: string; readonly result: ReturnType<Harness['run']> } {
  const itemId = randomUUID();
  const result = harness.run(
    mutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Irregular box',
          typeId: catalogue.typeId,
          values: [{ fieldId: catalogue.inputFieldId, values: [4] }, ...extra],
        },
      },
      { baseRevision: null, catalogueRevision: catalogue.revision }
    )
  );
  return { itemId, result };
}

describe('item.create with a computed-field override', () => {
  it('stores the override at the create revision and reads the field overridden', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const { itemId, result } = createWith(harness, catalogue, [
      { fieldId: catalogue.computedFieldId, source: 'override', values: [9] },
    ]);

    expect(result).toMatchObject({ status: 'applied', revision: 1 });
    expect(readItemFieldValues(harness.db, itemId)).toContainEqual({
      fieldId: catalogue.computedFieldId,
      source: 'override',
      catalogueRevision: catalogue.revision,
      values: [9],
    });
    const published = loadPublishedCatalogue(harness.db, catalogue.revision);
    if (published === null) throw new Error('published catalogue disappeared');
    expect(
      readEffectiveItemFieldValues(harness.db, published, itemId).find(
        (entry) => entry.fieldId === catalogue.computedFieldId
      )
    ).toEqual({
      fieldId: catalogue.computedFieldId,
      state: 'value',
      values: [9],
      provenance: { source: 'override', catalogueRevision: catalogue.revision },
    });
    const [event] = harness.eventsFor(itemId);
    expect(event?.kind).toBe('created');
    expect(JSON.parse(event?.after ?? '{}')).toMatchObject({
      [catalogue.inputFieldId]: [4],
      [catalogue.computedFieldId]: [9],
    });
  });

  it('refuses an override on a computed field that does not allow one, creating nothing', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const { itemId, result } = createWith(harness, catalogue, [
      { fieldId: catalogue.lockedFieldId, source: 'override', values: [9] },
    ]);

    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'invalid',
      message: expect.stringContaining('override is not writable'),
    });
    expect(harness.raw.prepare(`SELECT id FROM items WHERE id = ?`).get(itemId)).toBeUndefined();
    expect(readItemFieldValues(harness.db, itemId)).toEqual([]);
  });

  it('refuses a computed field sent as a stored value', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const { result } = createWith(harness, catalogue, [
      { fieldId: catalogue.computedFieldId, values: [9] },
    ]);

    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'invalid',
      message: expect.stringContaining('stored is not writable'),
    });
  });

  it('refuses an unknown source', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const { result } = createWith(harness, catalogue, [
      { fieldId: catalogue.computedFieldId, source: 'computed', values: [9] },
    ]);

    expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });
});
