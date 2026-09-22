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

  it('forbids mutating or removing published identities', () => {
    const baseField = field();
    const base = catalogue(1, [type([baseField])]);
    const mutated = catalogue(2, [type([{ ...baseField, key: 'different' }])]);
    const removed = catalogue(2, [type([])]);

    expect(classifyCatalogueCompatibility(base, mutated).classification).toBe('forbidden');
    expect(classifyCatalogueCompatibility(base, removed).classification).toBe('forbidden');
  });
});
