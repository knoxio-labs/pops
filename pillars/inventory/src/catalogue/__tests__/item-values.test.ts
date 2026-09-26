import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { itemFieldValues } from '../../db/schema.js';
import { mutation, openHarness, seedItem } from '../../domain/commands/__tests__/test-utils.js';
import { ItemFieldSetError, readItemFieldValues, validateItemFieldValues } from '../item-values.js';
import { ValueValidationError } from '../value-codec.js';
import { publishItemTypeTree } from './type-tree-fixture.js';

const TYPE_ID = '10000000-0000-5000-8000-000000000001';
const CABLE_TYPE_ID = 'b5ea5cd3-73b3-56dc-92e1-374eac720990';
const OPTION_ID = '20000000-0000-5000-8000-000000000001';
const ACTIVE_OPTION_ID = '20000000-0000-5000-8000-000000000002';
const FIELD_IDS = {
  short: '30000000-0000-5000-8000-000000000001',
  long: '30000000-0000-5000-8000-000000000002',
  integer: '30000000-0000-5000-8000-000000000003',
  decimal: '30000000-0000-5000-8000-000000000004',
  boolean: '30000000-0000-5000-8000-000000000005',
  enum: '30000000-0000-5000-8000-000000000006',
  measurement: '30000000-0000-5000-8000-000000000007',
  date: '30000000-0000-5000-8000-000000000008',
  dateTime: '30000000-0000-5000-8000-000000000009',
  url: '30000000-0000-5000-8000-000000000010',
  reference: '30000000-0000-5000-8000-000000000011',
} as const;

function publishRevisionTwo(harness: ReturnType<typeof openHarness>): void {
  harness.raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
       VALUES (2, 1, 'draft', 2, 'web', 'now')`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_types
         (revision, id, key, label, sort_order, capabilities_json, legacy_labels_json, presentation_json)
       VALUES (2, ?, 'dynamic', 'Dynamic', 0, '[]', '[]', '{}')`
    )
    .run(TYPE_ID);
  const insertField = harness.raw.prepare(
    `INSERT INTO item_type_fields
       (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
        storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
        presentation_json, archived_at)
     VALUES (2, ?, ?, ?, ?, ?, ?, ?, 0, 'stored', ?, ?, ?, 0, '{}', ?)`
  );
  const definitions = [
    [FIELD_IDS.short, 'short', 'short_text', 'one', null, '[]', '[]', null],
    [FIELD_IDS.long, 'long', 'long_text', 'many', null, '[]', '[]', null],
    [FIELD_IDS.integer, 'integer', 'integer', 'one', null, '[]', '[]', null],
    [FIELD_IDS.decimal, 'decimal', 'decimal', 'one', null, '[]', '[]', null],
    [FIELD_IDS.boolean, 'boolean', 'boolean', 'one', null, '[]', '[]', null],
    [FIELD_IDS.enum, 'enum', 'enum', 'many', null, '[]', '[]', null],
    [FIELD_IDS.measurement, 'measurement', 'measurement', 'one', 'kg', '[]', '[]', null],
    [FIELD_IDS.date, 'date', 'date', 'one', null, '[]', '[]', null],
    [FIELD_IDS.dateTime, 'date-time', 'date_time', 'one', null, '[]', '[]', null],
    [FIELD_IDS.url, 'url', 'url', 'one', null, '[]', '[]', null],
    [
      FIELD_IDS.reference,
      'reference',
      'reference',
      'one',
      null,
      '["item"]',
      JSON.stringify([CABLE_TYPE_ID]),
      null,
    ],
  ] as const;
  definitions.forEach((definition, sortOrder) => {
    insertField.run(
      definition[0],
      TYPE_ID,
      definition[1],
      definition[1],
      sortOrder,
      definition[2],
      definition[3],
      definition[4],
      definition[5],
      definition[6],
      definition[7]
    );
  });
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
         (revision, id, field_id, key, label, sort_order, archived_at)
       VALUES (2, ?, ?, 'retired', 'Retired', 0, '2026-09-22T00:00:00.000Z')`
    )
    .run(OPTION_ID, FIELD_IDS.enum);
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
         (revision, id, field_id, key, label, sort_order, archived_at)
       VALUES (2, ?, ?, 'active', 'Active', 1, NULL)`
    )
    .run(ACTIVE_OPTION_ID, FIELD_IDS.enum);
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'web', published_at = 'now'
       WHERE revision = 2`
    )
    .run();
}

/**
 * Publishes a revision 3 that restores the previously retired enum option,
 * reusing the same stable type/field IDs so existing item values remain valid.
 */
function publishRevisionThreeWithRestoredOption(harness: ReturnType<typeof openHarness>): void {
  harness.raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
       VALUES (3, 2, 'draft', 2, 'web', 'now')`
    )
    .run();
  harness.raw
    .prepare(
      `INSERT INTO item_types
         (revision, id, key, label, sort_order, capabilities_json, legacy_labels_json, presentation_json)
       VALUES (3, ?, 'dynamic', 'Dynamic', 0, '[]', '[]', '{}')`
    )
    .run(TYPE_ID);
  harness.raw
    .prepare(
      `INSERT INTO item_type_fields
         (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
          storage, fixed_unit, reference_kinds_json, reference_type_ids_json, allow_override,
          presentation_json, archived_at)
       VALUES (3, ?, ?, 'enum', 'enum', 0, 'enum', 'many', 0, 'stored', NULL, '[]', '[]', 0, '{}', NULL)`
    )
    .run(FIELD_IDS.enum, TYPE_ID);
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
         (revision, id, field_id, key, label, sort_order, archived_at)
       VALUES (3, ?, ?, 'retired', 'Retired', 0, NULL)`
    )
    .run(OPTION_ID, FIELD_IDS.enum);
  harness.raw
    .prepare(
      `INSERT INTO field_enum_options
         (revision, id, field_id, key, label, sort_order, archived_at)
       VALUES (3, ?, ?, 'active', 'Active', 1, NULL)`
    )
    .run(ACTIVE_OPTION_ID, FIELD_IDS.enum);
  harness.raw
    .prepare(
      `UPDATE catalogue_revisions
       SET status = 'published', published_actor_kind = 'web', published_at = 'now'
       WHERE revision = 3`
    )
    .run();
}

describe('validateItemFieldValues', () => {
  it('accepts every primitive and ordered many cardinality at valid boundaries', () => {
    const harness = openHarness();
    const targetId = '40000000-0000-4000-8000-000000000001';
    seedItem(harness, { id: targetId, typeKey: 'cable' });
    publishRevisionTwo(harness);

    const values = validateItemFieldValues(harness.db, {
      typeId: TYPE_ID,
      catalogueRevision: 2,
      fields: [
        { fieldId: FIELD_IDS.short, source: 'stored', values: ['x'] },
        { fieldId: FIELD_IDS.long, source: 'stored', values: ['first', 'second'] },
        { fieldId: FIELD_IDS.integer, source: 'stored', values: [Number.MAX_SAFE_INTEGER] },
        { fieldId: FIELD_IDS.decimal, source: 'stored', values: ['12.340'] },
        { fieldId: FIELD_IDS.boolean, source: 'stored', values: [false] },
        {
          fieldId: FIELD_IDS.measurement,
          source: 'stored',
          values: [{ amount: '1.500', unit: 'kg' }],
        },
        { fieldId: FIELD_IDS.date, source: 'stored', values: ['2024-02-29'] },
        { fieldId: FIELD_IDS.dateTime, source: 'stored', values: ['2026-09-22T04:05:06.123Z'] },
        { fieldId: FIELD_IDS.url, source: 'stored', values: ['https://example.com/a b'] },
        {
          fieldId: FIELD_IDS.reference,
          source: 'stored',
          values: [{ targetKind: 'item', targetId }],
        },
      ],
    });

    expect(values.find((entry) => entry.fieldId === FIELD_IDS.long)?.values).toHaveLength(2);
    expect(values.find((entry) => entry.fieldId === FIELD_IDS.url)?.values[0]?.value).toBe(
      'https://example.com/a%20b'
    );
  });

  it('rejects empty cardinality, duplicate fields, impossible references and wrong target types', () => {
    const harness = openHarness();
    const storageBoxId = '40000000-0000-4000-8000-000000000002';
    seedItem(harness, { id: storageBoxId, typeKey: 'storage_box' });
    publishRevisionTwo(harness);
    const base = { typeId: TYPE_ID, catalogueRevision: 2 } as const;

    expect(() =>
      validateItemFieldValues(harness.db, {
        ...base,
        fields: [{ fieldId: FIELD_IDS.long, source: 'stored', values: [] }],
      })
    ).toThrow(ItemFieldSetError);
    expect(() =>
      validateItemFieldValues(harness.db, {
        ...base,
        fields: [
          { fieldId: FIELD_IDS.short, source: 'stored', values: ['a'] },
          { fieldId: FIELD_IDS.short, source: 'stored', values: ['b'] },
        ],
      })
    ).toThrow(/more than once/u);
    expect(() =>
      validateItemFieldValues(harness.db, {
        ...base,
        fields: [
          {
            fieldId: FIELD_IDS.reference,
            source: 'stored',
            values: [{ targetKind: 'item', targetId: crypto.randomUUID() }],
          },
        ],
      })
    ).toThrow(ValueValidationError);
    expect(() =>
      validateItemFieldValues(harness.db, {
        ...base,
        fields: [
          {
            fieldId: FIELD_IDS.reference,
            source: 'stored',
            values: [{ targetKind: 'item', targetId: storageBoxId }],
          },
        ],
      })
    ).toThrow(/not permitted/u);
  });

  it('retains an existing archived enum choice but rejects a new selection', () => {
    const harness = openHarness();
    const existingId = '40000000-0000-4000-8000-000000000003';
    const newId = '40000000-0000-4000-8000-000000000004';
    seedItem(harness, { id: existingId });
    seedItem(harness, { id: newId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values({
        itemId: existingId,
        fieldId: FIELD_IDS.enum,
        source: 'stored',
        ordinal: 0,
        valueJson: JSON.stringify({ optionId: OPTION_ID }),
        catalogueRevision: 2,
        createdAt: 'now',
        updatedAt: 'now',
      })
      .run();
    const entry = {
      fieldId: FIELD_IDS.enum,
      source: 'stored' as const,
      values: [{ optionId: OPTION_ID }],
    };

    expect(
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [entry],
      })
    ).toHaveLength(1);
    expect(() =>
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: newId,
        fields: [entry],
      })
    ).toThrow(/archived/u);
  });

  it('cannot multiply an existing retired enum occurrence in a many-valued field', () => {
    const harness = openHarness();
    const existingId = '40000000-0000-4000-8000-000000000012';
    seedItem(harness, { id: existingId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values([
        {
          itemId: existingId,
          fieldId: FIELD_IDS.enum,
          source: 'stored',
          ordinal: 0,
          valueJson: JSON.stringify({ optionId: OPTION_ID }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        },
        {
          itemId: existingId,
          fieldId: FIELD_IDS.enum,
          source: 'stored',
          ordinal: 1,
          valueJson: JSON.stringify({ optionId: OPTION_ID }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        },
      ])
      .run();
    const retained = { optionId: OPTION_ID };

    expect(
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [{ fieldId: FIELD_IDS.enum, source: 'stored', values: [retained, retained] }],
      })
    ).toHaveLength(1);
    expect(() =>
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [
          {
            fieldId: FIELD_IDS.enum,
            source: 'stored',
            values: [retained, retained, retained],
          },
        ],
      })
    ).toThrow(/archived/u);
  });

  it('retains a retired multiset regardless of reordering, partial removal, or mixing with active options', () => {
    const harness = openHarness();
    const existingId = '40000000-0000-4000-8000-000000000013';
    seedItem(harness, { id: existingId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values([
        {
          itemId: existingId,
          fieldId: FIELD_IDS.enum,
          source: 'stored',
          ordinal: 0,
          valueJson: JSON.stringify({ optionId: OPTION_ID }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        },
        {
          itemId: existingId,
          fieldId: FIELD_IDS.enum,
          source: 'stored',
          ordinal: 1,
          valueJson: JSON.stringify({ optionId: OPTION_ID }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        },
        {
          itemId: existingId,
          fieldId: FIELD_IDS.enum,
          source: 'stored',
          ordinal: 2,
          valueJson: JSON.stringify({ optionId: ACTIVE_OPTION_ID }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        },
      ])
      .run();
    const retired = { optionId: OPTION_ID };
    const active = { optionId: ACTIVE_OPTION_ID };

    expect(
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [{ fieldId: FIELD_IDS.enum, source: 'stored', values: [active, retired, retired] }],
      })
    ).toHaveLength(1);
    expect(
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [{ fieldId: FIELD_IDS.enum, source: 'stored', values: [retired, active] }],
      })
    ).toHaveLength(1);
  });

  it('rejects a newly added retired occurrence for an item that never held it', () => {
    const harness = openHarness();
    const existingId = '40000000-0000-4000-8000-000000000014';
    seedItem(harness, { id: existingId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values({
        itemId: existingId,
        fieldId: FIELD_IDS.enum,
        source: 'stored',
        ordinal: 0,
        valueJson: JSON.stringify({ optionId: ACTIVE_OPTION_ID }),
        catalogueRevision: 2,
        createdAt: 'now',
        updatedAt: 'now',
      })
      .run();

    expect(() =>
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        existingItemId: existingId,
        fields: [
          {
            fieldId: FIELD_IDS.enum,
            source: 'stored',
            values: [{ optionId: ACTIVE_OPTION_ID }, { optionId: OPTION_ID }],
          },
        ],
      })
    ).toThrow(/archived/u);
    expect(() =>
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 2,
        fields: [{ fieldId: FIELD_IDS.enum, source: 'stored', values: [{ optionId: OPTION_ID }] }],
      })
    ).toThrow(/archived/u);
  });

  it('allows unrestricted use of an enum option once a later revision restores it', () => {
    const harness = openHarness();
    const existingId = '40000000-0000-4000-8000-000000000015';
    seedItem(harness, { id: existingId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values({
        itemId: existingId,
        fieldId: FIELD_IDS.enum,
        source: 'stored',
        ordinal: 0,
        valueJson: JSON.stringify({ optionId: OPTION_ID }),
        catalogueRevision: 2,
        createdAt: 'now',
        updatedAt: 'now',
      })
      .run();
    publishRevisionThreeWithRestoredOption(harness);

    expect(
      validateItemFieldValues(harness.db, {
        typeId: TYPE_ID,
        catalogueRevision: 3,
        fields: [
          {
            fieldId: FIELD_IDS.enum,
            source: 'stored',
            values: [{ optionId: OPTION_ID }, { optionId: OPTION_ID }],
          },
        ],
      })
    ).toHaveLength(1);
  });

  it('keeps reference identities while reporting resolved, deleted, and missing targets', () => {
    const harness = openHarness();
    const targetId = '40000000-0000-4000-8000-000000000005';
    const holders = [
      '40000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000008',
    ];
    seedItem(harness, { id: targetId, typeKey: 'cable' });
    holders.forEach((id) => seedItem(harness, { id }));
    publishRevisionTwo(harness);
    const targetIds = [targetId, targetId, '40000000-0000-4000-8000-000000000009'];
    holders.forEach((itemId, index) => {
      harness.db
        .insert(itemFieldValues)
        .values({
          itemId,
          fieldId: FIELD_IDS.reference,
          source: 'stored',
          ordinal: 0,
          valueJson: JSON.stringify({ targetKind: 'item', targetId: targetIds[index] }),
          catalogueRevision: 2,
          createdAt: 'now',
          updatedAt: 'now',
        })
        .run();
    });

    expect(readItemFieldValues(harness.db, holders[0] ?? '')[0]?.values[0]).toMatchObject({
      targetId,
      targetState: 'resolved',
    });
    harness.raw.prepare(`UPDATE items SET deleted_at = 'now' WHERE id = ?`).run(targetId);
    expect(readItemFieldValues(harness.db, holders[1] ?? '')[0]?.values[0]).toMatchObject({
      targetId,
      targetState: 'deleted',
    });
    expect(readItemFieldValues(harness.db, holders[2] ?? '')[0]?.values[0]).toMatchObject({
      targetState: 'missing',
    });
  });

  it('rejects a type change that would invalidate a live incoming reference', () => {
    const harness = openHarness();
    const targetId = '40000000-0000-4000-8000-000000000010';
    const holderId = '40000000-0000-4000-8000-000000000011';
    seedItem(harness, { id: targetId, typeKey: 'cable' });
    seedItem(harness, { id: holderId });
    publishRevisionTwo(harness);
    harness.db
      .insert(itemFieldValues)
      .values({
        itemId: holderId,
        fieldId: FIELD_IDS.reference,
        source: 'stored',
        ordinal: 0,
        valueJson: JSON.stringify({ targetKind: 'item', targetId }),
        catalogueRevision: 2,
        createdAt: 'now',
        updatedAt: 'now',
      })
      .run();

    expect(
      harness.run(
        mutation(
          'item.changeType',
          targetId,
          { typeKey: 'storage_box', fields: {} },
          { baseRevision: 1 }
        )
      )
    ).toMatchObject({
      status: 'rejected',
      reason: 'reference_type_mismatch',
      incomingReference: { itemId: holderId, fieldId: FIELD_IDS.reference },
    });
  });

  it('accepts a sheet item as a target for a reference constrained to bedding', () => {
    const harness = openHarness();
    const catalogue = publishItemTypeTree(harness.db);
    const targetId = randomUUID();
    const created = harness.run(
      mutation(
        'item.create',
        targetId,
        {
          item: {
            name: 'Sheet target',
            typeId: catalogue.sheetTypeId,
            values: [
              {
                fieldId: catalogue.materialFieldId,
                values: [{ optionId: catalogue.materialCottonOptionId }],
              },
            ],
          },
        },
        { baseRevision: null, catalogueRevision: catalogue.revision }
      )
    );
    expect(created).toMatchObject({ status: 'applied' });

    expect(
      validateItemFieldValues(harness.db, {
        typeId: catalogue.beddingTypeId,
        catalogueRevision: catalogue.revision,
        fields: [
          {
            fieldId: catalogue.materialFieldId,
            source: 'stored',
            values: [{ optionId: catalogue.materialCottonOptionId }],
          },
          {
            fieldId: catalogue.partnerFieldId,
            source: 'stored',
            values: [{ targetKind: 'item', targetId }],
          },
        ],
      })
    ).toHaveLength(2);
  });
});
