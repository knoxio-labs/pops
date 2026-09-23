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
  readonly enumFieldId: string;
  readonly activeOptionId: string;
  readonly retiredOptionId: string;
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
      {
        kind: 'put_field',
        typeId: type.id,
        key: 'tags',
        label: 'Tags',
        fieldKind: 'enum',
        cardinality: 'many',
        required: false,
        storage: 'stored',
      },
    ]
  );
  const fields = withField.draft.types.find((entry) => entry.id === type.id)?.fields;
  const field = fields?.find((entry) => entry.key === 'serial');
  const notesField = fields?.find((entry) => entry.key === 'notes');
  const referenceField = fields?.find((entry) => entry.key === 'connected_to');
  const enumField = fields?.find((entry) => entry.key === 'tags');
  if (!field) throw new Error('custom field was not created');
  if (!notesField) throw new Error('custom notes field was not created');
  if (!referenceField) throw new Error('custom reference field was not created');
  if (!enumField) throw new Error('custom enum field was not created');
  const withOptions = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision: 1, expectedDraftVersion: withField.draft.revision.draftVersion },
    [
      { kind: 'put_enum_option', fieldId: enumField.id, key: 'active', label: 'Active' },
      { kind: 'put_enum_option', fieldId: enumField.id, key: 'retired', label: 'Retired' },
    ]
  );
  const options = withOptions.draft.types
    .find((entry) => entry.id === type.id)
    ?.fields.find((entry) => entry.id === enumField.id)?.enumOptions;
  const activeOption = options?.find((entry) => entry.key === 'active');
  const retiredOption = options?.find((entry) => entry.key === 'retired');
  if (!activeOption) throw new Error('active enum option was not created');
  if (!retiredOption) throw new Error('retired enum option was not created');
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision: 1, expectedDraftVersion: withOptions.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision,
    typeId: type.id,
    fieldId: field.id,
    notesFieldId: notesField.id,
    referenceFieldId: referenceField.id,
    enumFieldId: enumField.id,
    activeOptionId: activeOption.id,
    retiredOptionId: retiredOption.id,
    cableTypeId: cable.id,
  };
}

function archiveEnumOption(harness: Harness, optionId: string, baseRevision: number): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const patched = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    [{ kind: 'archive_enum_option', id: optionId }]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return revision;
}

function restoreEnumOption(
  harness: Harness,
  optionId: string,
  fieldId: string,
  baseRevision: number
): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const patched = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    [{ kind: 'put_enum_option', id: optionId, fieldId, archivedAt: null }]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return revision;
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

function publishRenamedDefinitions(
  harness: Harness,
  catalogue: ReturnType<typeof publishCustomType>
): number {
  const created = createCatalogueDraft(harness.db, catalogue.revision, AUTHOR);
  const revision = created.revision.revision;
  const patched = patchCatalogueDraft(
    harness.db,
    {
      revision,
      baseRevision: catalogue.revision,
      expectedDraftVersion: created.revision.draftVersion,
    },
    [
      { kind: 'put_type', id: catalogue.typeId, label: 'Renamed custom device' },
      {
        kind: 'put_field',
        id: catalogue.fieldId,
        typeId: catalogue.typeId,
        label: 'Renamed serial',
      },
    ]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    {
      baseRevision: catalogue.revision,
      expectedDraftVersion: patched.draft.revision.draftVersion,
      note: null,
    },
    AUTHOR
  );
  return revision;
}

function replaceField(
  harness: Harness,
  typeId: string,
  fieldId: string,
  baseRevision: number
): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const patched = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    [
      { kind: 'archive_field', id: fieldId },
      {
        kind: 'put_field',
        typeId,
        key: 'replacement_serial',
        label: 'Replacement serial',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
    ]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return revision;
}

function archiveField(harness: Harness, fieldId: string, baseRevision: number): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  const patched = patchCatalogueDraft(
    harness.db,
    { revision, baseRevision, expectedDraftVersion: created.revision.draftVersion },
    [{ kind: 'archive_field', id: fieldId }]
  );
  publishCatalogueDraft(
    harness.db,
    revision,
    { baseRevision, expectedDraftVersion: patched.draft.revision.draftVersion, note: null },
    AUTHOR
  );
  return revision;
}

function increaseMinimumProtocol(harness: Harness, baseRevision: number): number {
  const created = createCatalogueDraft(harness.db, baseRevision, AUTHOR);
  const revision = created.revision.revision;
  publishCatalogueDraft(
    harness.db,
    revision,
    {
      baseRevision,
      minimumProtocol: 2,
      expectedDraftVersion: created.revision.draftVersion,
      note: null,
    },
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
    expect(stale).toMatchObject({ status: 'rejected', reason: 'type_unknown' });
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

  it('does not invent revision 1 for a stable-id command without an authored revision', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();

    const outcome = harness.run(
      mutation(
        'item.create',
        itemId,
        {
          item: {
            name: 'Unpinned sensor',
            typeId: catalogue.typeId,
            values: [{ fieldId: catalogue.fieldId, values: ['unsafe'] }],
          },
        },
        { baseRevision: null }
      )
    );

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM items WHERE id = ?`).get(itemId)
    ).toEqual({ count: 0 });
  });

  it('rebases a rename-only offline create and stores the active revision idempotently', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();
    const queued = mutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Queued sensor',
          typeId: catalogue.typeId,
          values: [{ fieldId: catalogue.fieldId, values: ['queued'] }],
        },
      },
      { baseRevision: null, catalogueRevision: catalogue.revision }
    );
    const activeRevision = publishRenamedDefinitions(harness, catalogue);

    const first = harness.run(queued);
    const replayed = harness.run(queued);

    expect(first).toMatchObject({ status: 'applied', revision: 1 });
    expect(replayed).toEqual(first);
    expect(readItemFieldValues(harness.db, itemId)).toEqual([
      {
        fieldId: catalogue.fieldId,
        source: 'stored',
        catalogueRevision: activeRevision,
        values: ['queued'],
      },
    ]);
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM events WHERE entity_id = ?`).get(itemId)
    ).toEqual({ count: 1 });
  });

  it('retains an offline edit for repair when its stable field is replaced', () => {
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
            values: [{ fieldId: catalogue.fieldId, values: ['before'] }],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );
    const queued = mutation(
      'item.edit',
      itemId,
      { values: [{ fieldId: catalogue.fieldId, values: ['offline'] }] },
      { baseRevision: 1, catalogueRevision: catalogue.revision }
    );
    replaceField(harness, catalogue.typeId, catalogue.fieldId, catalogue.revision);

    const first = harness.run(queued);
    const replayed = harness.run(queued);

    expect(first).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_repair_required',
    });
    expect(replayed).toEqual(first);
    expect(harness.item(itemId).revision).toBe(1);
    expect(readItemFieldValues(harness.db, itemId)[0]?.values).toEqual(['before']);
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM events WHERE entity_id = ?`).get(itemId)
    ).toEqual({ count: 1 });
  });

  it('splits an item while retaining a value from an archived field', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();
    const newItemId = randomUUID();
    harness.run(
      mutation(
        'item.create',
        itemId,
        {
          item: {
            name: 'Custom sensor pair',
            quantity: 2,
            typeId: catalogue.typeId,
            values: [
              { fieldId: catalogue.fieldId, values: ['SN-1'] },
              { fieldId: catalogue.notesFieldId, values: ['retained'] },
            ],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );
    const activeRevision = archiveField(harness, catalogue.notesFieldId, catalogue.revision);

    const outcome = harness.run(
      mutation(
        'item.split',
        itemId,
        { newItemId, quantity: 1 },
        { baseRevision: 1, catalogueRevision: activeRevision }
      )
    );

    expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
    expect(harness.item(itemId).quantity).toBe(1);
    expect(harness.item(newItemId)).toMatchObject({
      quantity: 1,
      typeId: catalogue.typeId,
    });
    const copied = readItemFieldValues(harness.db, newItemId);
    expect(copied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: catalogue.fieldId, values: ['SN-1'] }),
        expect.objectContaining({ fieldId: catalogue.notesFieldId, values: ['retained'] }),
      ])
    );
    expect(copied.every((entry) => entry.catalogueRevision === activeRevision)).toBe(true);
  });

  it('requires refreshed definitions before replay across a protocol-gated publication', () => {
    const harness = openHarness();
    const catalogue = publishCustomType(harness);
    const itemId = randomUUID();
    const queued = mutation(
      'item.create',
      itemId,
      {
        item: {
          name: 'Queued sensor',
          typeId: catalogue.typeId,
          values: [{ fieldId: catalogue.fieldId, values: ['queued'] }],
        },
      },
      { baseRevision: null, catalogueRevision: catalogue.revision }
    );
    const activeRevision = increaseMinimumProtocol(harness, catalogue.revision);

    const outcome = harness.run(queued);

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: 'catalogue_update_required',
      message: expect.stringContaining(`rebased to ${activeRevision}`),
    });
    expect(
      harness.raw.prepare(`SELECT count(*) AS count FROM items WHERE id = ?`).get(itemId)
    ).toEqual({ count: 0 });
  });

  describe('retired enum options in a many-valued field', () => {
    it('lets an edit reorder or partially remove a retained retired occurrence', () => {
      const harness = openHarness();
      const catalogue = publishCustomType(harness);
      const itemId = randomUUID();
      harness.run(
        mutation(
          'item.create',
          itemId,
          {
            item: {
              name: 'Tagged sensor',
              typeId: catalogue.typeId,
              values: [
                { fieldId: catalogue.fieldId, values: ['SN-1'] },
                {
                  fieldId: catalogue.enumFieldId,
                  values: [
                    { optionId: catalogue.retiredOptionId },
                    { optionId: catalogue.retiredOptionId },
                    { optionId: catalogue.activeOptionId },
                  ],
                },
              ],
            },
          },
          { baseRevision: null, catalogueRevision: catalogue.revision }
        )
      );
      const activeRevision = archiveEnumOption(
        harness,
        catalogue.retiredOptionId,
        catalogue.revision
      );

      const reordered = harness.run(
        mutation(
          'item.edit',
          itemId,
          {
            values: [
              {
                fieldId: catalogue.enumFieldId,
                values: [
                  { optionId: catalogue.activeOptionId },
                  { optionId: catalogue.retiredOptionId },
                  { optionId: catalogue.retiredOptionId },
                ],
              },
            ],
          },
          { baseRevision: 1, catalogueRevision: activeRevision }
        )
      );
      expect(reordered).toMatchObject({ status: 'applied', revision: 2 });
      expect(readItemFieldValues(harness.db, itemId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: catalogue.enumFieldId,
            values: [
              { optionId: catalogue.activeOptionId },
              { optionId: catalogue.retiredOptionId },
              { optionId: catalogue.retiredOptionId },
            ],
          }),
        ])
      );

      const partiallyRemoved = harness.run(
        mutation(
          'item.edit',
          itemId,
          {
            values: [
              {
                fieldId: catalogue.enumFieldId,
                values: [
                  { optionId: catalogue.retiredOptionId },
                  { optionId: catalogue.activeOptionId },
                ],
              },
            ],
          },
          { baseRevision: 2, catalogueRevision: activeRevision }
        )
      );
      expect(partiallyRemoved).toMatchObject({ status: 'applied', revision: 3 });
      expect(readItemFieldValues(harness.db, itemId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: catalogue.enumFieldId,
            values: [
              { optionId: catalogue.retiredOptionId },
              { optionId: catalogue.activeOptionId },
            ],
          }),
        ])
      );
    });

    it('rejects an edit that adds a brand new occurrence of a retired option', () => {
      const harness = openHarness();
      const catalogue = publishCustomType(harness);
      const itemId = randomUUID();
      harness.run(
        mutation(
          'item.create',
          itemId,
          {
            item: {
              name: 'Tagged sensor',
              typeId: catalogue.typeId,
              values: [
                { fieldId: catalogue.fieldId, values: ['SN-1'] },
                {
                  fieldId: catalogue.enumFieldId,
                  values: [{ optionId: catalogue.retiredOptionId }],
                },
              ],
            },
          },
          { baseRevision: null, catalogueRevision: catalogue.revision }
        )
      );
      const activeRevision = archiveEnumOption(
        harness,
        catalogue.retiredOptionId,
        catalogue.revision
      );

      const outcome = harness.run(
        mutation(
          'item.edit',
          itemId,
          {
            values: [
              {
                fieldId: catalogue.enumFieldId,
                values: [
                  { optionId: catalogue.retiredOptionId },
                  { optionId: catalogue.retiredOptionId },
                ],
              },
            ],
          },
          { baseRevision: 1, catalogueRevision: activeRevision }
        )
      );
      expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
      expect(harness.item(itemId).revision).toBe(1);
      expect(readItemFieldValues(harness.db, itemId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: catalogue.enumFieldId,
            values: [{ optionId: catalogue.retiredOptionId }],
          }),
        ])
      );

      const otherItemId = randomUUID();
      const freshSelection = harness.run(
        mutation(
          'item.create',
          otherItemId,
          {
            item: {
              name: 'Other sensor',
              typeId: catalogue.typeId,
              values: [
                { fieldId: catalogue.fieldId, values: ['SN-2'] },
                {
                  fieldId: catalogue.enumFieldId,
                  values: [{ optionId: catalogue.retiredOptionId }],
                },
              ],
            },
          },
          { baseRevision: null, catalogueRevision: activeRevision }
        )
      );
      expect(freshSelection).toMatchObject({ status: 'rejected', reason: 'invalid' });
    });

    it('allows unrestricted selection once a later revision restores the option', () => {
      const harness = openHarness();
      const catalogue = publishCustomType(harness);
      const itemId = randomUUID();
      harness.run(
        mutation(
          'item.create',
          itemId,
          {
            item: {
              name: 'Tagged sensor',
              typeId: catalogue.typeId,
              values: [
                { fieldId: catalogue.fieldId, values: ['SN-1'] },
                {
                  fieldId: catalogue.enumFieldId,
                  values: [{ optionId: catalogue.retiredOptionId }],
                },
              ],
            },
          },
          { baseRevision: null, catalogueRevision: catalogue.revision }
        )
      );
      const archivedRevision = archiveEnumOption(
        harness,
        catalogue.retiredOptionId,
        catalogue.revision
      );
      const restoredRevision = restoreEnumOption(
        harness,
        catalogue.retiredOptionId,
        catalogue.enumFieldId,
        archivedRevision
      );

      const outcome = harness.run(
        mutation(
          'item.edit',
          itemId,
          {
            values: [
              {
                fieldId: catalogue.enumFieldId,
                values: [
                  { optionId: catalogue.retiredOptionId },
                  { optionId: catalogue.retiredOptionId },
                  { optionId: catalogue.activeOptionId },
                ],
              },
            ],
          },
          { baseRevision: 1, catalogueRevision: restoredRevision }
        )
      );
      expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
      expect(readItemFieldValues(harness.db, itemId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: catalogue.enumFieldId,
            values: [
              { optionId: catalogue.retiredOptionId },
              { optionId: catalogue.retiredOptionId },
              { optionId: catalogue.activeOptionId },
            ],
          }),
        ])
      );
    });
  });
});
