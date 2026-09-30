import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import {
  createOpening,
  duplicateOpening,
  fieldDraftsFromProtocolFields,
  fieldDraftsFromStableValues,
} from './form-opening';

import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { FormTypeDef } from './field-model';

const cable: FormTypeDef = {
  id: 'cable',
  key: 'cable',
  label: 'Cable',
  description: null,
  containment: false,
  fields: [
    {
      id: 'colour-id',
      key: 'colour',
      label: 'Colour',
      kind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
    {
      id: 'active-id',
      key: 'active',
      label: 'Active',
      kind: 'boolean',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
  ],
};

const typed: FormTypeDef = {
  id: 'typed',
  key: 'typed',
  label: 'Typed',
  description: null,
  containment: false,
  fields: [
    {
      id: 'colour-option',
      key: 'colour',
      label: 'Colour',
      kind: 'enum',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [{ id: 'option-red', key: 'red', label: 'Red', archivedAt: null }],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
    {
      id: 'weight',
      key: 'weight',
      label: 'Weight',
      kind: 'measurement',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: 'kg',
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
    {
      id: 'related',
      key: 'related',
      label: 'Related',
      kind: 'reference',
      cardinality: 'many',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: ['item', 'location'],
      referenceTypeIds: [],
      expression: null,
    },
    {
      id: 'registered',
      key: 'registered',
      label: 'Registered',
      kind: 'date_time',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
  ],
};

describe('item form opening', () => {
  it('opens a create draft at the location supplied by the in query', () => {
    const opening = createOpening(
      new URLSearchParams('in=garage'),
      buildWorld([], [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' }]),
      undefined
    );

    expect(opening).toMatchObject({
      editing: null,
      revision: null,
      draft: { placement: { kind: 'location', locationId: 'garage' } },
    });
  });

  it('loads protocol field keys into stable form field ids', () => {
    expect(fieldDraftsFromProtocolFields({ colour: 'red', active: true }, cable)).toEqual({
      text: { 'colour-id': ['red'] },
      refs: {},
      booleans: { 'active-id': true },
    });
  });

  it('loads typed stable values for enum, measurement, references and date-time fields', () => {
    const world = buildWorld(
      [
        {
          id: 'item-1',
          name: 'Desk lamp',
          typeId: 'type-lamp',
          typeName: 'Lamp',
          code: null,
          quantity: 1,
          container: null,
          lifecycle: 'active',
          placement: { kind: 'in-hand' },
          previous: null,
          sync: 'synced',
          photoUrl: null,
          note: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [{ id: 'place-1', name: 'Workshop', parentId: null, kind: 'room' }]
    );
    expect(
      fieldDraftsFromStableValues(
        [
          { fieldId: 'colour-option', values: [{ optionId: 'option-red' }] },
          { fieldId: 'weight', values: [{ amount: '12.50', unit: 'kg' }] },
          {
            fieldId: 'related',
            values: [
              { targetKind: 'item', targetId: 'item-1' },
              { targetKind: 'location', targetId: 'place-1' },
              { targetKind: 'item', targetId: 'missing-item' },
              { targetKind: 'location', targetId: 'missing-place' },
            ],
          },
          { fieldId: 'registered', values: ['2026-01-02T03:04:05.000Z'] },
        ],
        typed,
        world
      )
    ).toEqual({
      text: {
        'colour-option': ['option-red'],
        weight: ['12.50'],
        registered: ['2026-01-02T03:04'],
      },
      refs: {
        related: [
          {
            id: 'item-1',
            kind: 'item',
            label: 'Desk lamp',
            typeId: 'type-lamp',
            typeName: 'Lamp',
          },
          { id: 'place-1', kind: 'location', label: 'Workshop' },
          { id: 'missing-item', kind: 'item', label: 'Unknown item' },
          { id: 'missing-place', kind: 'location', label: 'Unknown place' },
        ],
      },
      booleans: {},
    });
  });
});

function webItem(
  overrides: Partial<WebGetResponses[200]['item']> = {}
): WebGetResponses[200]['item'] {
  return {
    access: null,
    catalogueRevision: 3,
    code: 'CAB-009',
    computedValues: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    documentTitles: [],
    documentsStatus: 'none',
    externalIds: [],
    fieldValues: [],
    fields: {},
    id: 'item-source',
    isContainer: false,
    isFull: null,
    legacyType: null,
    lifecycle: 'active',
    lifecycleChangedAt: null,
    name: 'HDMI cable',
    note: 'Braided',
    photos: [
      { caption: null, sha256: 'a'.repeat(64) },
      { caption: 'Plug', sha256: 'b'.repeat(64) },
    ],
    placement: { kind: 'location', locationId: 'loc-desk' },
    previousPlacement: null,
    provenance: null,
    quantity: 3,
    revision: 8,
    seq: 12,
    typeId: null,
    typeKey: null,
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('duplicateOpening', () => {
  const world = buildWorld([], []);

  it('opens a create draft carrying everything but the code, which is bumped and checked', () => {
    const opening = duplicateOpening(webItem(), undefined, world);

    expect(opening.editing).toBeNull();
    expect(opening.revision).toBeNull();
    expect(opening.initial).toBe(opening.draft);
    expect(opening.draft).toMatchObject({
      mode: 'create',
      name: 'HDMI cable',
      quantity: '3',
      note: 'Braided',
      placement: { kind: 'location', locationId: 'loc-desk' },
      submitted: false,
      code: { value: 'CAB-010', status: 'checking', freeCode: null, takenBy: null },
    });
    expect(opening.copiedPhotos).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  });

  it('leaves the code empty when the source code has no number to bump', () => {
    expect(duplicateOpening(webItem({ code: 'DESK' }), undefined, world).draft.code).toMatchObject({
      value: '',
      status: 'idle',
    });
    expect(duplicateOpening(webItem({ code: null }), undefined, world).draft.code.value).toBe('');
  });

  it('carries the source computed values so overrides are shown against them', () => {
    const opening = duplicateOpening(
      webItem({
        computedValues: [
          {
            catalogueRevision: 3,
            dependencies: [],
            fieldId: 'replacement-value',
            source: 'computed',
            state: 'ok',
            traversedItemIds: [],
            values: [19.99],
          },
        ],
      }),
      undefined,
      world
    );

    expect(opening.computed['replacement-value']).toEqual({
      state: 'ok',
      values: [19.99],
      reason: null,
      missingInputs: [],
    });
  });
});

describe('createOpening', () => {
  it('copies no photos into a blank form', () => {
    expect(
      createOpening(new URLSearchParams(), buildWorld([], []), undefined).copiedPhotos
    ).toEqual([]);
  });
});
