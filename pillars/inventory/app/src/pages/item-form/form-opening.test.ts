import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import {
  createOpening,
  fieldDraftsFromProtocolFields,
  fieldDraftsFromStableValues,
} from './form-opening';

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
