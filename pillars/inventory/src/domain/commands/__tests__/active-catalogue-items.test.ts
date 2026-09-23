import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../../catalogue/authoring.js';
import { readItemFieldValues } from '../../../catalogue/index.js';
import { mutation, openHarness, seedItem } from './test-utils.js';

import type { Harness } from './test-utils.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

function publishCustomType(harness: Harness): {
  readonly revision: number;
  readonly typeId: string;
  readonly fieldId: string;
  readonly notesFieldId: string;
  readonly referenceFieldId: string;
  readonly cableTypeId: string;
} {
  const created = createCatalogueDraft(harness.db, 1, AUTHOR);
  const revision = created.revision.revision;
  const withType = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision: 1, expectedDraftVersion: created.revision.draftVersion },
    [
      {
        kind: 'put_type',
        key: 'custom_device',
        label: 'Custom device',
        capabilities: ['containment'],
      },
    ]
  );
  const type = withType.draft.types.find((entry) => entry.key === 'custom_device');
  if (!type) throw new Error('custom type was not created');
  const cable = withType.draft.types.find((entry) => entry.key === 'cable');
  if (!cable) throw new Error('cable type is unavailable');
  const withField = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision: 1, expectedDraftVersion: withType.draft.revision.draftVersion },
    [
      {
        kind: 'put_field',
        typeId: type.id,
        key: 'serial',
        label: 'Serial',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: true,
        storage: 'stored',
      },
      {
        kind: 'put_field',
        typeId: type.id,
        key: 'notes',
        label: 'Notes',
        fieldKind: 'long_text',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
      {
        kind: 'put_field',
        typeId: type.id,
        key: 'connected_to',
        label: 'Connected to',
        fieldKind: 'reference',
        cardinality: 'one',
        required: false,
        storage: 'stored',
        referenceKinds: ['item'],
        referenceTypeIds: [cable.id],
      },
    ]
  );
  const fields = withField.draft.types.find((entry) => entry.id === type.id)?.fields;
  const field = fields?.find((entry) => entry.key === 'serial');
  const notesField = fields?.find((entry) => entry.key === 'notes');
  const referenceField = fields?.find((entry) => entry.key === 'connected_to');
  if (!field) throw new Error('custom field was not created');
  if (!notesField) throw new Error('custom notes field was not created');
  if (!referenceField) throw new Error('custom reference field was not created');
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withField.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    typeId: type.id,
    fieldId: field.id,
    notesFieldId: notesField.id,
    referenceFieldId: referenceField.id,
    cableTypeId: cable.id,
  };
}

function archiveType(harness: Harness, typeId: string, baseRevision: number): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const archived = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    [{ kind: 'archive_type', id: typeId }]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: archived.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return revision;
}

describe('active catalogue item commands', () => {
  it('creates, edits, searches and changes a custom revision-2 type by stable IDs', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();

    const created = harness.run(
      mutation(
        'item.create',
        itemId,
        {
          item: {
            name: 'Custom sensor',
            typeId: catalogue.typeId,
            values: [{ fieldId: catalogue.fieldId, values: ['SN-1'] }],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );
    expect(created).toMatchObject({ status: 'applied', revision: 1 });
    expect(harness.item(itemId)).toMatchObject({
      typeId: catalogue.typeId,
      isContainer: 1,
      access: 'open',
    });
    expect(readItemFieldValues(harness.db, itemId)).toEqual([
      {
        fieldId: catalogue.fieldId,
        source: 'stored',
        catalogueRevision: catalogue.revision,
        values: ['SN-1'],
      },
    ]);

    const edited = harness.run(
      mutation(
        'item.edit',
        itemId,
        { values: [{ fieldId: catalogue.fieldId, values: ['SN-2'] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(edited).toMatchObject({ status: 'applied', revision: 2 });
    expect(readItemFieldValues(harness.db, itemId)[0]?.values).toEqual(['SN-2']);
    expect(
      harness.raw.prepare(`SELECT field_text AS fieldText FROM items_fts WHERE id = ?`).get(itemId)
    ).toEqual({ fieldText: 'SN-2' });

    const conflicted = harness.run(
      mutation(
        'item.edit',
        itemId,
        { values: [{ fieldId: catalogue.fieldId, values: ['SN-3'] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(conflicted).toMatchObject({
      status: 'conflict',
      kind: 'field',
      field: catalogue.fieldId,
      mine: ['SN-3'],
      theirs: ['SN-2'],
    });

    const concurrent = harness.run(
      mutation(
        'item.edit',
        itemId,
        { values: [{ fieldId: catalogue.notesFieldId, values: ['installed'] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(concurrent).toMatchObject({ status: 'applied', revision: 3, converged: false });

    const changed = harness.run(
      mutation(
        'item.changeType',
        itemId,
        { typeId: catalogue.cableTypeId, values: [] },
        { baseRevision: 3, catalogueRevision: catalogue.revision }
      )
    );
    expect(changed).toMatchObject({ status: 'applied', revision: 4 });
    expect(harness.item(itemId)).toMatchObject({
      typeId: catalogue.cableTypeId,
      isContainer: 0,
      access: null,
    });
    expect(readItemFieldValues(harness.db, itemId)).toEqual([]);
  });

  it('rejects invalid values atomically and does not downgrade a stale catalogue revision', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();
    harness.run(
      mutation(
        'item.create',
        itemId,
        {
          item: {
            name: 'Custom sensor',
            typeId: catalogue.typeId,
            values: [{ fieldId: catalogue.fieldId, values: ['valid'] }],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );

    const invalid = harness.run(
      mutation(
        'item.edit',
        itemId,
        { values: [{ fieldId: catalogue.fieldId, values: [42] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(invalid).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(harness.item(itemId).revision).toBe(1);
    expect(readItemFieldValues(harness.db, itemId)[0]?.values).toEqual(['valid']);

    const staleId = randomUUID();
    const stale = harness.run(
      mutation(
        'item.create',
        staleId,
        {
          item: {
            name: 'Stale sensor',
            typeId: catalogue.typeId,
            values: [{ fieldId: catalogue.fieldId, values: ['stale'] }],
          },
        },
        { baseRevision: null, catalogueRevision: 1 }
      )
    );
    expect(stale).toMatchObject({ status: 'rejected', reason: 'catalogue_changed' });
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM items WHERE id = ?`).get(staleId)
    ).toEqual({ count: 0 });

    const duplicate = harness.run(
      mutation(
        'item.edit',
        itemId,
        {
          values: [
            { fieldId: catalogue.fieldId, values: ['first'] },
            { fieldId: catalogue.fieldId, values: ['second'] },
          ],
        },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(duplicate).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(readItemFieldValues(harness.db, itemId)[0]?.values).toEqual(['valid']);

    const wrongTargetId = randomUUID();
    seedItem(harness, { id: wrongTargetId, typeKey: 'storage_box' });
    const wrongReference = harness.run(
      mutation(
        'item.edit',
        itemId,
        {
          values: [
            {
              fieldId: catalogue.referenceFieldId,
              values: [{ targetKind: 'item', targetId: wrongTargetId }],
            },
          ],
        },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(wrongReference).toMatchObject({
      status: 'rejected',
      reason: 'reference_type_mismatch',
    });
    expect(harness.item(itemId).revision).toBe(1);

    const archivedRevision = archiveType(harness, catalogue.typeId, catalogue.revision);
    const archivedId = randomUUID();
    const archived = harness.run(
      mutation(
        'item.create',
        archivedId,
        {
          item: {
            name: 'Archived sensor',
            typeId: catalogue.typeId,
            values: [{ fieldId: catalogue.fieldId, values: ['new'] }],
          },
        },
        { baseRevision: null, catalogueRevision: archivedRevision }
      )
    );
    expect(archived).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM items WHERE id = ?`).get(archivedId)
    ).toEqual({ count: 0 });
  });

  it('keeps revision-1 named built-in commands compatible after revision 2 publishes', () => {
    const harness = openHarness();
    publishCustomType(harness);
    const itemId = randomUUID();

    const outcome = harness.run(
      mutation(
        'item.create',
        itemId,
        { item: { name: 'Legacy bulb', typeKey: 'bulb', fields: { Fitting: 'E27' } } },
        { baseRevision: null }
      )
    );

    expect(outcome).toMatchObject({ status: 'applied' });
    expect(harness.fields(itemId)).toEqual({ Fitting: 'E27' });
    expect(readItemFieldValues(harness.db, itemId)[0]?.catalogueRevision).toBe(1);
  });
});
