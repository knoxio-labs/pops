import { describe, expect, it } from 'vitest';

import { classifyCatalogueCompatibility } from '../compatibility.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from '../catalogue-types.js';

function field(overrides: Partial<PersistedItemTypeField> = {}): PersistedItemTypeField {
  return {
    id: 'field-a',
    typeId: 'type-a',
    key: 'field-a',
    label: 'Field A',
    help: null,
    sortOrder: 0,
    kind: 'short_text',
    cardinality: 'one',
    required: false,
    storage: 'stored',
    fixedUnit: null,
    referenceKinds: new Set(),
    referenceTypeIds: new Set(),
    expressionVersion: null,
    expressionJson: null,
    allowOverride: false,
    presentation: {},
    archivedAt: null,
    replacedBy: null,
    enumOptionIds: new Set(),
    archivedEnumOptionIds: new Set(),
    enumOptions: [],
    ...overrides,
  };
}

function type(fields: readonly PersistedItemTypeField[]): PersistedItemType {
  return {
    revision: 1,
    id: 'type-a',
    key: 'type-a',
    label: 'Type A',
    description: null,
    sortOrder: 0,
    capabilities: [],
    legacyLabels: [],
    presentation: {},
    archivedAt: null,
    replacedBy: null,
    fields,
  };
}

function catalogue(
  revision: number,
  types: readonly PersistedItemType[],
  minimumProtocol = 1
): PersistedCatalogue {
  return {
    revision: {
      revision,
      baseRevision: revision === 1 ? null : 1,
      status: revision === 1 ? 'published' : 'draft',
      minimumProtocol,
    },
    types: types.map((entry) => ({ ...entry, revision })),
  };
}

describe('classifyCatalogueCompatibility', () => {
  it('accepts additive presentation changes and optional fields', () => {
    const baseField = field();
    const base = catalogue(1, [type([baseField])]);
    const candidate = catalogue(2, [
      { ...type([baseField, field({ id: 'field-b', key: 'field-b' })]), label: 'Renamed' },
    ]);

    expect(classifyCatalogueCompatibility(base, candidate)).toMatchObject({
      classification: 'compatible',
      affectedIds: ['field-b'],
    });
  });

  it('requires migrations for required fields and capability changes', () => {
    const baseField = field();
    const base = catalogue(1, [type([baseField])]);
    const candidate = catalogue(2, [
      {
        ...type([{ ...baseField, required: true }]),
        capabilities: ['containment'],
      },
    ]);

    expect(classifyCatalogueCompatibility(base, candidate)).toMatchObject({
      classification: 'migration_required',
      affectedIds: ['field-a', 'type-a'],
    });
  });

  it('protocol-gates a newly used primitive kind', () => {
    const baseField = field();
    const base = catalogue(1, [type([baseField])]);
    const candidate = catalogue(
      2,
      [type([baseField, field({ id: 'field-b', key: 'field-b', kind: 'date' })])],
      2
    );

    expect(classifyCatalogueCompatibility(base, candidate).classification).toBe('protocol_gated');
  });

  describe('a new type', () => {
    function newType(fields: readonly PersistedItemTypeField[]): PersistedItemType {
      return {
        ...type(fields.map((entry) => ({ ...entry, typeId: 'type-b' }))),
        id: 'type-b',
        key: 'type-b',
      };
    }

    it('protocol-gates each field whose primitive kind the base never used', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [
        type([field()]),
        newType([
          field({ id: 'field-when', key: 'when', kind: 'date_time' }),
          field({ id: 'field-link', key: 'link', kind: 'reference' }),
          field({ id: 'field-name', key: 'name' }),
        ]),
      ]);

      const result = classifyCatalogueCompatibility(base, candidate);

      expect(result.classification).toBe('protocol_gated');
      expect(result.changes).toEqual([
        { classification: 'compatible', definitionId: 'type-b', code: 'type_added' },
        {
          classification: 'protocol_gated',
          definitionId: 'field-when',
          code: 'primitive_kind_added',
        },
        {
          classification: 'protocol_gated',
          definitionId: 'field-link',
          code: 'primitive_kind_added',
        },
      ]);
      expect(result.affectedIds).toEqual(['field-link', 'field-when', 'type-b']);
    });

    it('gates a new kind exactly as adding the same field to an existing type does', () => {
      const base = catalogue(1, [type([field()])]);
      const dated = field({ id: 'field-when', key: 'when', kind: 'date' });
      const onNewType = classifyCatalogueCompatibility(
        base,
        catalogue(2, [type([field()]), newType([dated])])
      );
      const onExistingType = classifyCatalogueCompatibility(
        base,
        catalogue(2, [type([field(), dated])])
      );

      const gated = (changes: typeof onNewType.changes) =>
        changes.filter((change) => change.classification === 'protocol_gated');
      expect(gated(onNewType.changes)).toEqual(gated(onExistingType.changes));
      expect(gated(onNewType.changes)).toHaveLength(1);
    });

    it('stays compatible when every field uses a kind the base already uses', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [
        type([field()]),
        newType([
          field({ id: 'field-required', key: 'required', required: true }),
          field({ id: 'field-optional', key: 'optional' }),
        ]),
      ]);

      expect(classifyCatalogueCompatibility(base, candidate)).toMatchObject({
        classification: 'compatible',
        affectedIds: ['type-b'],
      });
    });

    it('needs no migration for its required or computed fields, only the protocol gate', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [
        type([field()]),
        newType([
          field({ id: 'field-count', key: 'count', kind: 'integer', required: true }),
          field({
            id: 'field-double',
            key: 'double',
            kind: 'integer',
            storage: 'computed',
            expressionVersion: 1,
            expressionJson: JSON.stringify({ op: 'literal', value: 2 }),
          }),
        ]),
      ]);

      const result = classifyCatalogueCompatibility(base, candidate);

      expect(result.classification).toBe('protocol_gated');
      expect(result.changes.map((change) => change.code)).toEqual([
        'type_added',
        'primitive_kind_added',
        'primitive_kind_added',
      ]);
    });
  });

  it('forbids mutating or removing published identities', () => {
    const baseField = field();
    const base = catalogue(1, [type([baseField])]);
    const mutated = catalogue(2, [type([{ ...baseField, key: 'different' }])]);
    const removed = catalogue(2, [type([])]);

    expect(classifyCatalogueCompatibility(base, mutated).classification).toBe('forbidden');
    expect(classifyCatalogueCompatibility(base, removed).classification).toBe('forbidden');
  });
});
