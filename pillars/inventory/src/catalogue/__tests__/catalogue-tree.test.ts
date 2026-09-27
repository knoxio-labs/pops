import { describe, expect, it } from 'vitest';

import { ancestorIds, descendantIds, resolveTypeTree, typeChain } from '../catalogue-tree.js';

import type { UnresolvedItemType, UnresolvedItemTypeField } from '../catalogue-types.js';

function field(overrides: Partial<UnresolvedItemTypeField> = {}): UnresolvedItemTypeField {
  return {
    allowOverride: false,
    archivedAt: null,
    archivedEnumOptionIds: new Set(),
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    enumOptionIds: new Set(),
    expressionJson: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id: 'field-id',
    key: 'Field',
    kind: 'short_text',
    label: 'Field',
    presentation: {},
    referenceKinds: new Set(),
    referenceTypeIds: new Set(),
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type-id',
    ...overrides,
  };
}

function type(id: string, overrides: Partial<UnresolvedItemType> = {}): UnresolvedItemType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [],
    id,
    key: id,
    label: id,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
    ...overrides,
  };
}

function catalogueTypes(): UnresolvedItemType[] {
  return [
    type('bedding', {
      capabilities: ['containment'],
      fields: [
        field({
          id: 'material',
          key: 'Material',
          label: 'Material',
          kind: 'reference',
          referenceKinds: new Set(['item']),
          referenceTypeIds: new Set(['bedding']),
          sortOrder: 0,
          typeId: 'bedding',
        }),
        field({ id: 'colour', key: 'Colour', label: 'Colour', sortOrder: 1, typeId: 'bedding' }),
      ],
    }),
    type('linen', {
      fields: [field({ id: 'bed-size', key: 'Bed size', label: 'Bed size', typeId: 'linen' })],
      parentTypeId: 'bedding',
    }),
    type('sheet', {
      fields: [field({ id: 'fitted', key: 'Fitted', label: 'Fitted', typeId: 'sheet' })],
      parentTypeId: 'linen',
    }),
  ];
}

describe('resolveTypeTree', () => {
  it('orders effective fields from root to leaf and preserves owner identity', () => {
    const resolved = resolveTypeTree(catalogueTypes());
    const byId = new Map(resolved.map((entry) => [entry.id, entry]));
    const sheet = byId.get('sheet');

    expect(sheet?.effectiveFields.map((entry) => entry.key)).toEqual([
      'Material',
      'Colour',
      'Bed size',
      'Fitted',
    ]);
    expect(sheet?.effectiveFields[0]).toBe(byId.get('bedding')?.fields[0]);
    expect(sheet?.effectiveFields[1]).toBe(byId.get('bedding')?.fields[1]);
    expect(sheet?.effectiveFields[2]).toBe(byId.get('linen')?.fields[0]);
    expect(sheet?.effectiveFields[3]).toBe(sheet?.fields[0]);
  });

  it('inherits and de-duplicates capabilities', () => {
    const sheet = resolveTypeTree(catalogueTypes()).find((entry) => entry.id === 'sheet');

    expect(sheet?.effectiveCapabilities).toEqual(['containment']);
  });

  it('admits references to every descendant of a referenced type', () => {
    const bedding = resolveTypeTree(catalogueTypes()).find((entry) => entry.id === 'bedding');
    const material = bedding?.fields.find((entry) => entry.id === 'material');

    expect(material?.admittedReferenceTypeIds).toEqual(new Set(['bedding', 'linen', 'sheet']));
  });

  it('reports cycles and keeps the repeated id out of the ancestor list', () => {
    const types = [
      type('A', {
        fields: [field({ id: 'a-field', typeId: 'A' })],
        parentTypeId: 'B',
      }),
      type('B', {
        fields: [field({ id: 'b-field', typeId: 'B' })],
        parentTypeId: 'A',
      }),
    ];

    expect(typeChain(types, 'A')).toEqual({ ancestorIds: ['B'], stop: 'cycle' });
    expect(
      resolveTypeTree(types)
        .find((entry) => entry.id === 'A')
        ?.effectiveFields.map((entry) => entry.id)
    ).toEqual(['b-field', 'a-field']);
  });

  it('reports a missing parent and leaves the type with its own fields', () => {
    const types = [
      type('orphan', {
        fields: [field({ id: 'orphan-field', typeId: 'orphan' })],
        parentTypeId: 'missing',
      }),
    ];

    expect(typeChain(types, 'orphan')).toEqual({ ancestorIds: [], stop: 'missing_parent' });
    expect(resolveTypeTree(types)[0]?.effectiveFields.map((entry) => entry.id)).toEqual([
      'orphan-field',
    ]);
  });

  it('includes archived descendants', () => {
    const types = catalogueTypes();
    types.push(
      type('archived-child', {
        archivedAt: '2026-09-27T00:00:00.000Z',
        parentTypeId: 'bedding',
      })
    );

    expect(ancestorIds(types, 'sheet')).toEqual(['bedding', 'linen']);
    expect(descendantIds(types, 'bedding')).toEqual(['linen', 'sheet', 'archived-child']);
  });
});
