import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  publishComputedType,
  type ComputedCatalogue,
} from '../../../catalogue/__tests__/computed-catalogue-fixture.js';
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

function createItem(harness: Harness, catalogue: ComputedCatalogue): string {
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
    const catalogue = publishComputedType(harness.db);
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
        {
          baseRevision: catalogue.revision,
          expectedDraftVersion: draft.revision.draftVersion,
          note: null,
        },
        AUTHOR
      )
    ).toThrow(CatalogueApiError);
    try {
      publishCatalogueDraft(
        harness.db,
        draft.revision.revision,
        {
          baseRevision: catalogue.revision,
          expectedDraftVersion: draft.revision.draftVersion,
          note: null,
        },
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
    const catalogue = publishComputedType(harness.db);
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
    const catalogue = publishComputedType(harness.db);
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
      failedFieldId: catalogue.inputFieldId,
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
    const catalogue = publishComputedType(harness.db);
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
    const catalogue = publishComputedType(harness.db);
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

  it('rebases an override written against an older compatible revision', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const itemId = createItem(harness, catalogue);
    const next = createCatalogueDraft(harness.db, catalogue.revision, AUTHOR);
    const patched = patchCatalogueDraft(
      harness.db,
      {
        revision: next.revision.revision,
        baseRevision: catalogue.revision,
        expectedDraftVersion: next.revision.draftVersion,
      },
      [{ kind: 'put_type', key: 'unrelated', label: 'Unrelated' }]
    );
    publishCatalogueDraft(
      harness.db,
      next.revision.revision,
      {
        baseRevision: catalogue.revision,
        expectedDraftVersion: patched.draft.revision.draftVersion,
        note: null,
      },
      AUTHOR
    );

    expect(
      harness.run(
        mutation(
          'item.setOverride',
          itemId,
          { fieldId: catalogue.computedFieldId, values: [9] },
          { baseRevision: 1, catalogueRevision: catalogue.revision }
        )
      )
    ).toMatchObject({ status: 'applied', revision: 2 });
  });

  it('asks for a catalogue refresh when the override names a revision this server lacks', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const itemId = createItem(harness, catalogue);

    expect(
      harness.run(
        mutation(
          'item.setOverride',
          itemId,
          { fieldId: catalogue.computedFieldId, values: [9] },
          { baseRevision: 1, catalogueRevision: catalogue.revision + 5 }
        )
      )
    ).toMatchObject({ status: 'rejected', reason: 'catalogue_update_required' });
    expect(harness.item(itemId).revision).toBe(1);
  });

  it('always allows clearing an override the field no longer permits, but never setting one', () => {
    const harness = openHarness();
    const catalogue = publishComputedType(harness.db);
    const itemId = createItem(harness, catalogue);
    harness.raw
      .prepare(
        `INSERT INTO item_field_values
           (item_id, field_id, source, ordinal, value_json, catalogue_revision, created_at, updated_at)
         VALUES (?, ?, 'override', 0, '9', ?, ?, ?)`
      )
      .run(
        itemId,
        catalogue.lockedFieldId,
        catalogue.revision,
        '2026-09-18T12:00:00.000Z',
        '2026-09-18T12:00:00.000Z'
      );
    expect(readItemFieldValues(harness.db, itemId)).toContainEqual({
      fieldId: catalogue.lockedFieldId,
      source: 'override',
      catalogueRevision: catalogue.revision,
      values: [9],
    });

    expect(
      harness.run(
        mutation(
          'item.setOverride',
          itemId,
          { fieldId: catalogue.lockedFieldId, values: [11] },
          { baseRevision: 1, catalogueRevision: catalogue.revision }
        )
      )
    ).toMatchObject({ status: 'rejected' });
    expect(
      readItemFieldValues(harness.db, itemId).find(
        (entry) => entry.fieldId === catalogue.lockedFieldId
      )
    ).toMatchObject({ values: [9] });

    const clear = harness.run(
      mutation(
        'item.clearOverride',
        itemId,
        { fieldId: catalogue.lockedFieldId },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(clear).toMatchObject({ status: 'applied', revision: 2 });
    expect(
      readItemFieldValues(harness.db, itemId).find(
        (entry) => entry.fieldId === catalogue.lockedFieldId
      )
    ).toBeUndefined();
  });
});
