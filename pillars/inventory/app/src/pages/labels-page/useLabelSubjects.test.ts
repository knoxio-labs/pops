import { describe, expect, it } from 'vitest';

import { detailsFor } from './label-details';
import { labelFieldState } from './label-field-state';
import { treeFragility } from './label-fragility';

import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types';
import type { WebListResponses } from '../../inventory-api/types.gen';

type WebItem = WebListResponses[200]['items'][number];

function field(overrides: Partial<CatalogueField>): CatalogueField {
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
    id: 'field-id',
    key: 'field',
    kind: 'short_text',
    label: 'Field',
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type-appliance',
    ...overrides,
  };
}

const colour = field({
  enumOptions: [{ archivedAt: null, id: 'option-red', key: 'red', label: 'Red', sortOrder: 0 }],
  id: 'field-colour',
  key: 'colour',
  kind: 'enum',
  label: 'Colour',
});

const weight = field({
  fixedUnit: 'kg',
  id: 'field-weight',
  key: 'weight',
  kind: 'measurement',
  label: 'Weight',
});

const type: CatalogueType = {
  archivedAt: null,
  capabilities: [],
  description: null,
  fields: [colour, weight],
  id: 'type-appliance',
  key: 'appliance',
  label: 'Appliance',
  legacyLabels: [],
  parentTypeId: null,
  presentation: {},
  replacedBy: null,
  revision: 1,
  sortOrder: 0,
};

const item: WebItem = {
  access: null,
  catalogueRevision: 1,
  code: 'A-1',
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [
    {
      catalogueRevision: 1,
      fieldId: colour.id,
      source: 'stored',
      values: [{ optionId: 'option-red' }],
    },
    {
      catalogueRevision: 1,
      fieldId: weight.id,
      source: 'stored',
      values: [{ amount: '1.5', unit: 'kg' }],
    },
  ],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Kettle',
  note: null,
  photos: [],
  placement: { kind: 'hand' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: type.id,
  typeKey: type.key,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('detailsFor', () => {
  it('carries field icons to print details independently of field names', () => {
    const configured = {
      ...type,
      fields: [{ ...colour, label: 'Renamed field', presentation: { icon: 'PackageOpenUp' } }],
    };
    expect(detailsFor(item, [], new Map([[type.id, configured]])).fields).toEqual([
      { id: 'appliance.colour', label: 'Renamed field', value: 'Red', icon: 'PackageOpenUp' },
    ]);
  });

  it('uses catalogue labels and display values for enum and measurement fields', () => {
    const details = detailsFor(item, [], new Map([[type.id, type]]));

    expect(details).toEqual({
      typeName: 'Appliance',
      fields: [
        { id: 'appliance.colour', label: 'Colour', value: 'Red' },
        { id: 'appliance.weight', label: 'Weight', value: '1.5 kg' },
      ],
      contents: [],
    });
  });

  it('prints inherited fields first and keeps each field under its owner type', () => {
    const inherited = field({
      id: 'field-material',
      key: 'material',
      label: 'Material',
      typeId: 'type-bedding',
    });
    const local = field({
      id: 'field-fitted',
      key: 'fitted',
      label: 'Fitted',
      typeId: 'type-sheet',
    });
    const parent: CatalogueType = {
      ...type,
      fields: [inherited],
      id: 'type-bedding',
      key: 'bedding',
      label: 'Bedding',
    };
    const child: CatalogueType = {
      ...type,
      fields: [local],
      id: 'type-sheet',
      key: 'sheet',
      label: 'Sheet',
      parentTypeId: parent.id,
    };
    const childItem: WebItem = {
      ...item,
      fieldValues: [
        { catalogueRevision: 1, fieldId: inherited.id, source: 'stored', values: ['Cotton'] },
        { catalogueRevision: 1, fieldId: local.id, source: 'stored', values: [true] },
      ],
      typeId: child.id,
      typeKey: child.key,
    };

    expect(
      detailsFor(
        childItem,
        [],
        new Map([
          [parent.id, parent],
          [child.id, child],
        ])
      )
    ).toEqual({
      typeName: 'Bedding › Sheet',
      fields: [
        { id: 'bedding.material', label: 'Material', value: 'Cotton' },
        { id: 'sheet.fitted', label: 'Fitted', value: 'Yes' },
      ],
      contents: [],
    });
  });

  it('retains legacy fields while the catalogue is unavailable', () => {
    const legacy = { ...item, fields: { Colour: 'White' }, typeId: null, typeKey: 'legacy' };

    expect(detailsFor(legacy, [], new Map())).toMatchObject({
      typeName: 'legacy',
      fields: [{ id: 'legacy.Colour', label: 'Colour', value: 'White' }],
    });
  });

  it('sorts box contents by name for the printed contents section', () => {
    const legacy = { ...item, typeId: null, typeKey: 'legacy' };

    expect(
      detailsFor(
        legacy,
        [
          { name: 'Zulu', quantity: 1 },
          { name: 'Alpha', quantity: 1 },
        ],
        new Map()
      ).contents
    ).toEqual(['Alpha', 'Zulu']);
  });
});

const fragileField = field({
  id: 'fragile-field',
  key: 'Fragile',
  label: 'Handling',
  kind: 'boolean',
});
const fragileType: CatalogueType = { ...type, fields: [fragileField] };
const fragileTypes = new Map([[type.id, fragileType]]);

describe('label field availability', () => {
  it('keeps an unavailable computed field selectable and reports only its own failure', () => {
    const configured = {
      ...fragileType,
      fields: [{ ...fragileField, storage: 'computed' as const }, colour],
    };
    const state = labelFieldState(
      { ...item, fieldValues: [], computedValues: [] },
      new Map([[type.id, configured]])
    );
    expect(state.choices.map((choice) => choice.id)).toEqual([
      'appliance.colour',
      'appliance.Fragile',
    ]);
    expect([...state.errors.keys()]).toEqual(['appliance.Fragile']);
    expect(state.errors.get('appliance.Fragile')?.message).toContain('Handling');
  });

  it('accepts an explicit override for an unavailable computed field', () => {
    const configured = {
      ...fragileType,
      fields: [{ ...fragileField, storage: 'computed' as const }],
    };
    const state = labelFieldState(
      {
        ...item,
        fieldValues: [
          { catalogueRevision: 1, fieldId: fragileField.id, source: 'override', values: [false] },
        ],
      },
      new Map([[type.id, configured]])
    );
    expect(state.errors.size).toBe(0);
    expect(state.choices).toHaveLength(1);
  });
});

function withFragility(value: unknown): WebItem {
  return {
    ...item,
    fieldValues: [
      { catalogueRevision: 1, fieldId: fragileField.id, source: 'stored', values: [value] },
    ],
  };
}

describe('configured item fragility', () => {
  it.each([true, false, 'Yes', 'false', null])(
    'requires boolean true instead of formatted truthiness: %s',
    (value) => {
      const result = treeFragility(withFragility(value), [], fragileTypes);
      expect(result.fragile).toBe(value === true);
      expect(result.recorded).toBe(true);
      expect(result.fields).toEqual(new Set(['appliance.Fragile']));
      expect(result.error).toBeNull();
    }
  );

  it('inherits the Fragile field and preserves its defining type key for deduplication', () => {
    const child: CatalogueType = {
      ...type,
      id: 'child-type',
      key: 'child',
      parentTypeId: type.id,
      fields: [],
    };
    const result = treeFragility(
      { ...withFragility(true), typeId: child.id, typeKey: child.key },
      [],
      new Map([
        [type.id, fragileType],
        [child.id, child],
      ])
    );
    expect(result.fragile).toBe(true);
    expect(result.fields.has('appliance.Fragile')).toBe(true);
  });

  it('uses an explicit false override instead of stored true', () => {
    const original = withFragility(true);
    const result = treeFragility(
      {
        ...original,
        fieldValues: [
          ...original.fieldValues,
          { catalogueRevision: 1, fieldId: fragileField.id, source: 'override', values: [false] },
        ],
      },
      [],
      fragileTypes
    );
    expect(result.fragile).toBe(false);
  });

  it('warns for any supplied nested descendant even when the selected item is false', () => {
    const descendant = { ...withFragility(true), id: 'deep-child' };
    expect(treeFragility(withFragility(false), [descendant], fragileTypes).fragile).toBe(true);
    expect(treeFragility(withFragility(false), [], fragileTypes).fragile).toBe(false);
  });

  it('reports unavailable computed fragility instead of silently treating it as false', () => {
    const types = new Map([
      [type.id, { ...fragileType, fields: [{ ...fragileField, storage: 'computed' as const }] }],
    ]);
    const missing = { ...item, fieldValues: [], computedValues: [] };
    expect(treeFragility(missing, [], types).error).toBeInstanceOf(Error);
    expect(
      treeFragility(
        {
          ...missing,
          fieldValues: [
            { catalogueRevision: 1, fieldId: fragileField.id, source: 'override', values: [false] },
          ],
        },
        [],
        types
      ).error
    ).toBeNull();
  });

  it('retains the manual fallback when no selectable Fragile field exists', () => {
    expect(treeFragility(item, [], new Map()).recorded).toBe(false);
    expect(
      treeFragility({ ...item, typeId: null, fields: { Fragile: true } }, [], new Map()).fragile
    ).toBe(true);
    expect(
      treeFragility({ ...item, typeId: null, fields: { Fragile: 'Yes' } }, [], new Map()).recorded
    ).toBe(false);
  });

  it.each([true, false])('allows a manual warning for untyped legacy Fragile=%s', (fragile) => {
    const result = treeFragility(
      { ...item, typeId: null, typeKey: null, fields: { Fragile: fragile } },
      [],
      new Map()
    );
    expect(result.fragile).toBe(fragile);
    expect(result.recorded).toBe(false);
    expect(result.fields.size).toBe(0);
  });
});

describe('computed Fragile values', () => {
  it.each(['ok', 'overridden'] as const)('uses effective boolean values in state %s', (state) => {
    const types = new Map([
      [type.id, { ...fragileType, fields: [{ ...fragileField, storage: 'computed' as const }] }],
    ]);
    const base = {
      fieldId: fragileField.id,
      source: 'computed' as const,
      catalogueRevision: 1,
      dependencies: [],
      traversedItemIds: [],
    };
    const effective: WebItem['computedValues'][number] =
      state === 'ok'
        ? { ...base, state: 'ok', values: [true] }
        : { ...base, state: 'overridden', values: [true], override: { catalogueRevision: 1 } };
    const computed: WebItem = { ...item, fieldValues: [], computedValues: [effective] };
    const result = treeFragility(computed, [], types);
    expect(result.fragile).toBe(true);
    expect(result.error).toBeNull();
  });
});
