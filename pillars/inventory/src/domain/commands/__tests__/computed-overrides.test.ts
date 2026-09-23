import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CatalogueApiError,
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

import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

function publishComputedType(harness: Harness): {
  readonly revision: number;
  readonly typeId: string;
  readonly inputFieldId: string;
  readonly computedFieldId: string;
  readonly lockedFieldId: string;
} {
  const created = createCatalogueDraft(harness.db, 1, AUTHOR);
  const revision = created.revision.revision;
  const withType = patchCatalogueDraft(harness.db, revision, 1, [
    { kind: 'put_type', key: 'computed_device', label: 'Computed device' },
  ]);
  const type = withType.draft.types.find((entry) => entry.key === 'computed_device');
  if (type === undefined) throw new Error('computed type was not created');
  const withInput = patchCatalogueDraft(harness.db, revision, 1, [
    {
      kind: 'put_field',
      typeId: type.id,
      key: 'input',
      label: 'Input',
      fieldKind: 'integer',
      cardinality: 'one',
      required: true,
      storage: 'stored',
    },
  ]);
  const input = withInput.draft.types
    .find((entry) => entry.id === type.id)
    ?.fields.find((entry) => entry.key === 'input');
  if (input === undefined) throw new Error('input field was not created');
  const expression = {
    op: 'multiply',
    left: { op: 'read', path: [], fieldId: input.id },
    right: { op: 'literal', value: 2 },
  } as const;
  const withComputed = patchCatalogueDraft(harness.db, revision, 1, [
    {
      kind: 'put_field',
      typeId: type.id,
      key: 'computed',
      label: 'Computed',
      fieldKind: 'integer',
      cardinality: 'one',
      required: true,
      storage: 'computed',
      expressionVersion: 1,
      expression,
      allowOverride: true,
    },
    {
      kind: 'put_field',
      typeId: type.id,
      key: 'locked',
      label: 'Locked',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression,
      allowOverride: false,
    },
  ]);
  const fields = withComputed.draft.types.find((entry) => entry.id === type.id)?.fields;
  const computed = fields?.find((entry) => entry.key === 'computed');
  const locked = fields?.find((entry) => entry.key === 'locked');
  if (computed === undefined || locked === undefined) {
    throw new Error('computed fields were not created');
  }
  publishCatalogueDraft(harness.db, revision, { baseRevision: 1, note: null }, AUTHOR);
  return {
    revision,
    typeId: type.id,
    inputFieldId: input.id,
    computedFieldId: computed.id,
    lockedFieldId: locked.id,
  };
}

function createItem(harness: Harness, catalogue: ReturnType<typeof publishComputedType>): string {
  const itemId = randomUUID();
  const result = harness.run(
    mutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Computed item',
          typeId: catalogue.typeId,
          values: [{ fieldId: catalogue.inputFieldId, values: [4] }],
        },
      },
      { baseRevision: null, catalogueRevision: catalogue.revision }
    )
  );
  expect(result).toMatchObject({ status: 'applied', revision: 1 });
  return itemId;
}

describe('computed field override commands', () => {
  it('refuses publication when the persisted draft expression is invalid', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness);
    const draft = createCatalogueDraft(harness.db, catalogue.revision, AUTHOR);
    harness.raw
      .prepare(
        `UPDATE item_type_fields
         SET expression_json = ?
         WHERE revision = ? AND id = ?`
      )
      .run(
        JSON.stringify({ op: 'read', path: [], fieldId: randomUUID() }),
        draft.revision.revision,
        catalogue.computedFieldId
      );

    expect(() =>
      publishCatalogueDraft(
        harness.db,
        draft.revision.revision,
        { baseRevision: catalogue.revision, note: null },
        AUTHOR
      )
    ).toThrow(CatalogueApiError);
    try {
      publishCatalogueDraft(
        harness.db,
        draft.revision.revision,
        { baseRevision: catalogue.revision, note: null },
        AUTHOR
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: 'catalogue_validation_failed',
        issues: [{ code: 'expression_field_unknown' }],
      });
    }
  });

  it('evaluates computed fields with dependency provenance from the read snapshot', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness);
    const itemId = createItem(harness, catalogue);
    const published = loadPublishedCatalogue(harness.db, catalogue.revision);
    if (published === null) throw new Error('published catalogue disappeared');

    expect(readEffectiveItemFieldValues(harness.db, published, itemId)).toEqual(
      [
        {
          fieldId: catalogue.inputFieldId,
          state: 'value',
          values: [4],
          provenance: { source: 'stored', catalogueRevision: catalogue.revision },
        },
        {
          fieldId: catalogue.computedFieldId,
          state: 'value',
          values: [8],
          provenance: {
            source: 'computed',
            catalogueRevision: catalogue.revision,
            dependencies: [{ itemId, fieldId: catalogue.inputFieldId, revision: 1 }],
          },
        },
        {
          fieldId: catalogue.lockedFieldId,
          state: 'value',
          values: [8],
          provenance: {
            source: 'computed',
            catalogueRevision: catalogue.revision,
            dependencies: [{ itemId, fieldId: catalogue.inputFieldId, revision: 1 }],
          },
        },
      ].toSorted((left, right) => left.fieldId.localeCompare(right.fieldId))
    );

    expect(
      harness.run(
        mutation(
          'item.edit',
          itemId,
          { values: [{ fieldId: catalogue.inputFieldId, values: [5] }] },
          { baseRevision: 1, catalogueRevision: catalogue.revision }
        )
      )
    ).toMatchObject({ status: 'applied', revision: 2 });
    expect(
      readEffectiveItemFieldValues(harness.db, published, itemId).find(
        (entry) => entry.fieldId === catalogue.computedFieldId
      )
    ).toMatchObject({ state: 'value', values: [10] });
  });

  it('returns unavailable instead of inventing a value for a missing dependency', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness);
    const itemId = createItem(harness, catalogue);
    harness.raw
      .prepare(`DELETE FROM item_field_values WHERE item_id = ? AND field_id = ?`)
      .run(itemId, catalogue.inputFieldId);
    const published = loadPublishedCatalogue(harness.db, catalogue.revision);
    if (published === null) throw new Error('published catalogue disappeared');

    expect(
      readEffectiveItemFieldValues(harness.db, published, itemId).find(
        (entry) => entry.fieldId === catalogue.computedFieldId
      )
    ).toEqual({
      fieldId: catalogue.computedFieldId,
      state: 'unavailable',
      reason: 'missing_dependency',
      traversedItemIds: [itemId],
      provenance: {
        source: 'computed',
        catalogueRevision: catalogue.revision,
        dependencies: [],
      },
    });
  });

  it('sets and clears an override without persisting a computed fallback', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness);
    const itemId = createItem(harness, catalogue);

    const set = harness.run(
      mutation(
        'item.setOverride',
        itemId,
        { fieldId: catalogue.computedFieldId, values: [9] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(set).toMatchObject({ status: 'applied', revision: 2 });
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

    const clear = harness.run(
      mutation(
        'item.clearOverride',
        itemId,
        { fieldId: catalogue.computedFieldId },
        { baseRevision: 2, catalogueRevision: catalogue.revision }
      )
    );
    expect(clear).toMatchObject({ status: 'applied', revision: 3 });
    expect(
      readItemFieldValues(harness.db, itemId).find(
        (entry) => entry.fieldId === catalogue.computedFieldId
      )
    ).toBeUndefined();
    expect(
      readEffectiveItemFieldValues(harness.db, published, itemId).find(
        (entry) => entry.fieldId === catalogue.computedFieldId
      )
    ).toMatchObject({
      state: 'value',
      values: [8],
      provenance: { source: 'computed' },
    });
    expect(
      harness.raw.prepare(`SELECT kind FROM events WHERE entity_id = ? ORDER BY seq`).all(itemId)
    ).toEqual([{ kind: 'created' }, { kind: 'override_set' }, { kind: 'override_cleared' }]);
  });

  it('rejects forbidden, malformed and stale overrides atomically', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness);
    const itemId = createItem(harness, catalogue);

    for (const [fieldId, values, catalogueRevision] of [
      [catalogue.lockedFieldId, [9], catalogue.revision],
      [catalogue.computedFieldId, ['wrong'], catalogue.revision],
      [catalogue.computedFieldId, [9], 1],
    ] as const) {
      expect(
        harness.run(
          mutation(
            'item.setOverride',
            itemId,
            { fieldId, values },
            { baseRevision: 1, catalogueRevision }
          )
        )
      ).toMatchObject({ status: 'rejected' });
    }
    expect(harness.item(itemId).revision).toBe(1);
    expect(readItemFieldValues(harness.db, itemId)).toHaveLength(1);
  });
});
