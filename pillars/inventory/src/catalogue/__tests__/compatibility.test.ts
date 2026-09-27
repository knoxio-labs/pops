import { describe, expect, it } from 'vitest';

import { resolveTypeTree } from '../catalogue-tree.js';
import { classifyCatalogueCompatibility } from '../compatibility.js';

import type {
  PersistedCatalogue,
  UnresolvedItemType,
  UnresolvedItemTypeField,
} from '../catalogue-types.js';

function field(overrides: Partial<UnresolvedItemTypeField> = {}): UnresolvedItemTypeField {
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
    defaultValues: [],
    presentation: {},
    archivedAt: null,
    replacedBy: null,
    enumOptionIds: new Set(),
    archivedEnumOptionIds: new Set(),
    enumOptions: [],
    ...overrides,
  };
}

function type(fields: readonly UnresolvedItemTypeField[]): UnresolvedItemType {
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
    parentTypeId: null,
    fields,
  };
}

function catalogue(
  revision: number,
  types: readonly UnresolvedItemType[],
  minimumProtocol = 1
): PersistedCatalogue {
  return {
    revision: {
      revision,
      baseRevision: revision === 1 ? null : 1,
      status: revision === 1 ? 'published' : 'draft',
      minimumProtocol,
    },
    types: resolveTypeTree(types.map((entry) => ({ ...entry, revision }))),
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

  it('treats a changed default as neutral: no change, no migration', () => {
    const base = catalogue(1, [type([field({ defaultValues: ['old'] })])]);
    const candidate = catalogue(2, [type([field({ defaultValues: ['new', 'other'] })])]);

    expect(classifyCatalogueCompatibility(base, candidate)).toEqual({
      classification: 'compatible',
      affectedIds: [],
      changes: [],
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
    function newType(fields: readonly UnresolvedItemTypeField[]): UnresolvedItemType {
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
          definitionId: 'field-link',
          code: 'primitive_kind_added',
        },
        {
          classification: 'protocol_gated',
          definitionId: 'field-when',
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

  describe('computed fields', () => {
    const expression = JSON.stringify({ op: 'literal', value: 'a' });
    const computed = field({
      id: 'field-computed',
      key: 'computed',
      storage: 'computed',
      expressionVersion: 1,
      expressionJson: expression,
    });

    it('adds a computed field compatibly, even a required one, because its values are derived', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [type([field(), { ...computed, required: true }])]);

      expect(classifyCatalogueCompatibility(base, candidate)).toMatchObject({
        classification: 'compatible',
        changes: [
          {
            classification: 'compatible',
            definitionId: 'field-computed',
            code: 'computed_field_added',
          },
        ],
      });
    });

    it('still protocol-gates a computed field whose primitive kind the base never used', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [type([field(), { ...computed, kind: 'integer' }])]);

      expect(classifyCatalogueCompatibility(base, candidate).changes).toEqual([
        {
          classification: 'protocol_gated',
          definitionId: 'field-computed',
          code: 'primitive_kind_added',
        },
      ]);
    });

    it('keeps adding a required stored field migration-required', () => {
      const base = catalogue(1, [type([field()])]);
      const candidate = catalogue(2, [
        type([field(), field({ id: 'field-b', key: 'field-b', required: true })]),
      ]);

      expect(classifyCatalogueCompatibility(base, candidate).classification).toBe(
        'migration_required'
      );
    });

    it('changes an expression, including to a coalesce node, compatibly and without a protocol gate', () => {
      const base = catalogue(1, [type([field(), computed])]);
      const coalesce = JSON.stringify({
        op: 'coalesce',
        values: [
          { op: 'read', path: [], fieldId: 'field-a' },
          { op: 'literal', value: 'a' },
        ],
      });
      const candidate = catalogue(2, [type([field(), { ...computed, expressionJson: coalesce }])]);

      expect(classifyCatalogueCompatibility(base, candidate)).toMatchObject({
        classification: 'compatible',
        changes: [
          {
            classification: 'compatible',
            definitionId: 'field-computed',
            code: 'computed_expression_changed',
          },
        ],
      });
    });

    it('enables overrides compatibly', () => {
      const base = catalogue(1, [type([computed])]);
      const candidate = catalogue(2, [type([{ ...computed, allowOverride: true }])]);

      expect(classifyCatalogueCompatibility(base, candidate).changes).toEqual([
        {
          classification: 'compatible',
          definitionId: 'field-computed',
          code: 'computed_overrides_enabled',
        },
      ]);
    });

    it('disables overrides compatibly when no live item holds one', () => {
      const base = catalogue(1, [type([{ ...computed, allowOverride: true }])]);
      const candidate = catalogue(2, [type([computed])]);

      expect(
        classifyCatalogueCompatibility(base, candidate, new Set(['another-field'])).changes
      ).toEqual([
        {
          classification: 'compatible',
          definitionId: 'field-computed',
          code: 'computed_overrides_disabled',
        },
      ]);
    });

    it('requires a migration to disable overrides that live items hold', () => {
      const base = catalogue(1, [type([{ ...computed, allowOverride: true }])]);
      const candidate = catalogue(2, [type([computed])]);

      expect(
        classifyCatalogueCompatibility(base, candidate, new Set(['field-computed']))
      ).toMatchObject({
        classification: 'migration_required',
        changes: [
          {
            classification: 'migration_required',
            definitionId: 'field-computed',
            code: 'computed_overrides_in_use',
          },
        ],
      });
    });

    it('ignores override holdings when the policy does not change', () => {
      const overridable = { ...computed, allowOverride: true };
      const base = catalogue(1, [type([overridable])]);
      const candidate = catalogue(2, [type([overridable])]);

      expect(
        classifyCatalogueCompatibility(base, candidate, new Set(['field-computed'])).changes
      ).toEqual([]);
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
