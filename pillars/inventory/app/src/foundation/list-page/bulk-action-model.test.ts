import { describe, expect, it } from 'vitest';

import {
  bulkFieldCandidates,
  bulkFieldPatch,
  encodeBulkFieldValues,
  sharedTypeFieldLabels,
  supportsBulkField,
  typeChangeValues,
} from './bulk-action-model.js';

import type {
  TypesReadCatalogueResponses,
  WebListResponses,
} from '../../inventory-api/types.gen.js';
import type { ItemRowModel } from '../model/model.js';

type Catalogue = TypesReadCatalogueResponses[200];
type CatalogueType = Catalogue['types'][number];
type CatalogueField = CatalogueType['fields'][number];
type WebItem = WebListResponses['200']['items'][number];

function field(
  typeId: string,
  id: string,
  label: string,
  overrides: Partial<CatalogueField> = {}
): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key: id,
    kind: 'short_text',
    label,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
    ...overrides,
  };
}

function type(id: string, fields: readonly CatalogueField[]): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label: id,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function catalogue(types: readonly CatalogueType[]): Catalogue {
  const actor = { id: 'test', kind: 'web' as const, label: 'Test' };
  return {
    revision: {
      abandoned: null,
      baseRevision: null,
      created: { actor, at: '2026-09-01T00:00:00.000Z' },
      draftVersion: 1,
      minimumProtocol: 2,
      published: { actor, at: '2026-09-01T00:00:00.000Z', note: null },
      revision: 1,
      status: 'published',
    },
    types: [...types],
  };
}

function row(id: string, typeId: string): ItemRowModel {
  return {
    id,
    name: id,
    typeId,
    typeName: typeId,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

const baseItem: WebItem = {
  access: null,
  catalogueRevision: 1,
  code: null,
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Item',
  note: null,
  photos: [],
  placement: { kind: 'hand' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: 'type-old',
  typeKey: 'old',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function webItem(id: string, fieldValues: WebItem['fieldValues'] = []): WebItem {
  return { ...baseItem, id, name: id, fieldValues };
}

describe('bulk action model', () => {
  it('offers only writable fields and counts the compatible selected rows', () => {
    const editable = field('type-a', 'name', 'Name');
    const reference = field('type-a', 'related', 'Related', { kind: 'reference' });
    const computed = field('type-a', 'computed', 'Computed', {
      storage: 'computed',
      allowOverride: true,
    });
    const dynamicMeasurement = field('type-a', 'size', 'Size', { kind: 'measurement' });
    const other = field('type-b', 'colour', 'Colour');
    const types = [
      type('type-a', [editable, reference, computed, dynamicMeasurement]),
      type('type-b', [other]),
    ];
    const published = catalogue(types);

    expect(supportsBulkField(editable)).toBe(true);
    expect(supportsBulkField(reference)).toBe(true);
    expect(supportsBulkField(computed)).toBe(false);
    expect(supportsBulkField(dynamicMeasurement)).toBe(false);
    expect(
      bulkFieldCandidates(
        [row('item-a', 'type-a'), row('item-b', 'type-b')],
        ['item-a', 'item-b'],
        published
      )
    ).toEqual([
      { field: other, have: 1, itemIds: ['item-b'] },
      { field: editable, have: 1, itemIds: ['item-a'] },
      { field: reference, have: 1, itemIds: ['item-a'] },
    ]);
  });

  it('encodes supported input kinds and rejects invalid boundaries', () => {
    const integer = field('type-a', 'count', 'Count', { kind: 'integer' });
    const enumField = field('type-a', 'colour', 'Colour', {
      kind: 'enum',
      cardinality: 'many',
      enumOptions: [
        { archivedAt: null, id: 'red', key: 'red', label: 'Red', sortOrder: 0 },
        {
          archivedAt: '2026-09-01T00:00:00.000Z',
          id: 'old',
          key: 'old',
          label: 'Old',
          sortOrder: 1,
        },
      ],
    });
    const measurement = field('type-a', 'weight', 'Weight', {
      kind: 'measurement',
      fixedUnit: 'kg',
    });
    const reference = field('type-a', 'related', 'Related', {
      kind: 'reference',
      cardinality: 'many',
      referenceKinds: ['item', 'location'],
      referenceTypeIds: ['type-cable'],
    });

    expect(encodeBulkFieldValues(integer, '4')).toEqual([4]);
    expect(encodeBulkFieldValues(integer, '4.5')).toBeNull();
    expect(encodeBulkFieldValues(enumField, ['red'])).toEqual([{ optionId: 'red' }]);
    expect(encodeBulkFieldValues(enumField, ['old'])).toBeNull();
    expect(encodeBulkFieldValues(measurement, '2.5')).toEqual([{ amount: '2.5', unit: 'kg' }]);
    expect(
      encodeBulkFieldValues(reference, [
        { id: 'item-1', kind: 'item', label: 'Cable', typeId: 'type-cable' },
        { id: 'room-1', kind: 'location', label: 'Workshop' },
      ])
    ).toEqual([
      { targetKind: 'item', targetId: 'item-1' },
      { targetKind: 'location', targetId: 'room-1' },
    ]);
    expect(
      encodeBulkFieldValues(reference, [
        { id: 'item-2', kind: 'item', label: 'Lamp', typeId: 'type-lamp' },
      ])
    ).toBeNull();
    expect(bulkFieldPatch(measurement, '')).toBeNull();
  });

  it('retains valid stored values shared with a new type, including references', () => {
    const oldStored = field('type-old', 'old-only', 'Old only');
    const shared = field('type-old', 'shared', 'Shared');
    const sharedReference = field('type-old', 'related', 'Related', { kind: 'reference' });
    const override = field('type-old', 'override', 'Override', {
      storage: 'computed',
      allowOverride: true,
    });
    const targetShared = { ...shared, typeId: 'type-new' };
    const targetReference = { ...sharedReference, typeId: 'type-new' };
    const target = type('type-new', [targetShared, targetReference]);
    const values = typeChangeValues(
      [
        webItem('item-1', [
          { catalogueRevision: 1, fieldId: oldStored.id, source: 'stored', values: ['drop'] },
          { catalogueRevision: 1, fieldId: shared.id, source: 'stored', values: ['keep'] },
          {
            catalogueRevision: 1,
            fieldId: sharedReference.id,
            source: 'stored',
            values: [{ targetKind: 'item', targetId: 'item-2' }],
          },
          { catalogueRevision: 1, fieldId: override.id, source: 'override', values: ['drop'] },
          { catalogueRevision: 1, fieldId: shared.id, source: 'stored', values: [{ bad: true }] },
        ]),
      ],
      target
    );

    expect(values.get('item-1')).toEqual([
      { fieldId: 'shared', values: ['keep'] },
      { fieldId: 'related', values: [{ targetKind: 'item', targetId: 'item-2' }] },
    ]);
    expect(
      sharedTypeFieldLabels(row('item-1', 'type-old'), target, {
        types: [type('type-old', [oldStored, shared, sharedReference, override]), target],
      })
    ).toEqual(['Shared', 'Related']);
  });
});
