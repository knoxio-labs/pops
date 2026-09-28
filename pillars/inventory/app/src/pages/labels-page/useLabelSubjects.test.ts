import { describe, expect, it } from 'vitest';

import { detailsFor } from './label-details';

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
});
