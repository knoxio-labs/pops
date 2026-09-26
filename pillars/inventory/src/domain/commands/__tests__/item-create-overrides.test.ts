import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  publishComputedType,
  type ComputedCatalogue,
} from '../../../catalogue/__tests__/computed-catalogue-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../../catalogue/authoring.js';
import {
  loadPublishedCatalogue,
  readEffectiveItemFieldValues,
  readItemFieldValues,
} from '../../../catalogue/index.js';
import { mutation, openHarness } from './test-utils.js';

import type { DraftOperation } from '../../../catalogue/authoring-types.js';
import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

type Draft = ReturnType<typeof patchCatalogueDraft>['draft'];

function publish(
  harness: Harness,
  baseRevision: number,
  operations: (draft: Draft) => DraftOperation[]
): { readonly revision: number; readonly draft: Draft } {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const target = { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion };
  const { draft } = patchCatalogueDraft(harness.db, target, operations(created));
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return { revision, draft };
}

function idOf(draft: Draft, key: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  const field = draft.types.flatMap((entry) => entry.fields).find((entry) => entry.key === key);
  const id = type?.id ?? field?.id;
  if (id === undefined) throw new Error(`no definition ${key}`);
  return id;
}

/**
 * Replaces the computed type with `meter`, whose `meter_input` replaces
 * `input` and whose `meter_computed`, the same shape as `computed`, replaces it.
 */
function replaceComputedType(
  harness: Harness,
  catalogue: ComputedCatalogue,
  allowOverride: boolean
): { readonly revision: number; readonly draft: Draft } {
  const typed = publish(harness, catalogue.revision, () => [
    { kind: 'put_type', key: 'meter', label: 'Meter' },
  ]);
  const inputted = publish(harness, typed.revision, (draft) => [
    {
      kind: 'put_field',
      typeId: idOf(draft, 'meter'),
      key: 'meter_input',
      label: 'Input',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const computed = publish(harness, inputted.revision, (draft) => [
    {
      kind: 'put_field',
      typeId: idOf(draft, 'meter'),
      key: 'meter_computed',
      label: 'Computed',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression: {
        op: 'multiply',
        left: { op: 'read', path: [], fieldId: idOf(draft, 'meter_input') },
        right: { op: 'literal', value: 2 },
      },
      allowOverride,
    },
  ]);
  return publish(harness, computed.revision, (draft) => [
    { kind: 'archive_type', id: catalogue.typeId, replacedBy: idOf(draft, 'meter') },
    { kind: 'archive_field', id: catalogue.inputFieldId, replacedBy: idOf(draft, 'meter_input') },
    {
      kind: 'archive_field',
      id: catalogue.computedFieldId,
      replacedBy: idOf(draft, 'meter_computed'),
    },
  ]);
}

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

describe('item.create with an override, rebased onto a replacement type', () => {
  function queueOverride(catalogue: ComputedCatalogue, itemId: string) {
    return mutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Irregular box',
          typeId: catalogue.typeId,
          values: [
            { fieldId: catalogue.inputFieldId, values: [4] },
            { fieldId: catalogue.computedFieldId, source: 'override', values: [9] },
          ],
        },
      },
      { baseRevision: null, catalogueRevision: catalogue.revision }
    );
  }

  it('moves the override onto the replacement computed field that allows one', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const itemId = randomUUID();
    const queued = queueOverride(catalogue, itemId);
    const replaced = replaceComputedType(harness, catalogue, true);

    const outcome = harness.run(queued);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'applied' });
    expect(harness.item(itemId).typeId).toBe(idOf(replaced.draft, 'meter'));
    expect(
      readItemFieldValues(harness.db, itemId).map(({ fieldId, source, values }) => ({
        fieldId,
        source,
        values,
      }))
    ).toEqual(
      expect.arrayContaining([
        { fieldId: idOf(replaced.draft, 'meter_input'), source: 'stored', values: [4] },
        { fieldId: idOf(replaced.draft, 'meter_computed'), source: 'override', values: [9] },
      ])
    );
  });

  it('moves nothing when the replacement computed field refuses overrides, naming the type', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const itemId = randomUUID();
    const queued = queueOverride(catalogue, itemId);
    const replaced = replaceComputedType(harness, catalogue, false);

    expect(harness.run(queued)).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_repair_required',
      catalogueChanges: [
        {
          definition: 'type',
          id: catalogue.typeId,
          change: 'replaced',
          replacementId: idOf(replaced.draft, 'meter'),
          revision: replaced.revision,
        },
      ],
    });
    expect(harness.raw.prepare(`SELECT id FROM items WHERE id = ?`).get(itemId)).toBeUndefined();
  });
});
