import { describe, expect, it } from 'vitest';

import { encodeBulkReferenceValues } from './bulk-reference-model.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

type CatalogueField = CatalogueType['fields'][number];

function field(typeId: string, referenceTypeIds: readonly string[]): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'many',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id: 'related',
    key: 'related',
    kind: 'reference',
    label: 'Related',
    presentation: {},
    referenceKinds: ['item'],
    referenceTypeIds: [...referenceTypeIds],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
  };
}

function type(
  id: string,
  parentTypeId: string | null,
  fields: readonly CatalogueField[] = []
): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label: id,
    legacyLabels: [],
    parentTypeId,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

describe('bulk reference model', () => {
  it('accepts descendants of an allowed parent and rejects a sibling', () => {
    const types = [
      type('type-parent', null),
      type('type-child', 'type-parent'),
      type('type-other', null),
    ];
    const reference = field('type-holder', ['type-parent']);

    expect(
      encodeBulkReferenceValues(
        reference,
        [{ id: 'child-item', kind: 'item', label: 'Child', typeId: 'type-child' }],
        types
      )
    ).toEqual([{ targetId: 'child-item', targetKind: 'item' }]);
    expect(
      encodeBulkReferenceValues(
        reference,
        [{ id: 'other-item', kind: 'item', label: 'Other', typeId: 'type-other' }],
        types
      )
    ).toBeNull();
  });

  it('keeps a leaf restriction exact', () => {
    const types = [
      type('type-parent', null),
      type('type-leaf', 'type-parent'),
      type('type-sibling', 'type-parent'),
    ];
    const reference = field('type-holder', ['type-leaf']);

    expect(
      encodeBulkReferenceValues(
        reference,
        [{ id: 'leaf-item', kind: 'item', label: 'Leaf', typeId: 'type-leaf' }],
        types
      )
    ).toEqual([{ targetId: 'leaf-item', targetKind: 'item' }]);
    expect(
      encodeBulkReferenceValues(
        reference,
        [{ id: 'sibling-item', kind: 'item', label: 'Sibling', typeId: 'type-sibling' }],
        types
      )
    ).toBeNull();
  });
});
