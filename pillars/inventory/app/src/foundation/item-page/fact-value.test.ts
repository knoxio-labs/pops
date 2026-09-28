import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model';
import { formatFactValue } from './fact-value';

import type { CatalogueField } from '../../catalogue-editor/types';

function field(overrides: Partial<CatalogueField> = {}): CatalogueField {
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
    id: 'field-1',
    key: 'detail',
    kind: 'short_text',
    label: 'Detail',
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type-1',
    ...overrides,
  };
}

const world = buildWorld(
  [
    {
      id: 'item-2',
      name: 'Spare cable',
      typeId: null,
      typeName: null,
      code: null,
      quantity: 1,
      container: null,
      lifecycle: 'active',
      placement: { kind: 'in-hand' },
      previous: null,
      sync: 'synced',
      photoUrl: null,
      note: null,
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ],
  []
);

describe('formatFactValue', () => {
  it('formats enum options and references through the read world', () => {
    expect(
      formatFactValue(
        [{ optionId: 'good' }],
        field({
          kind: 'enum',
          enumOptions: [{ id: 'good', key: 'good', label: 'Good', sortOrder: 0, archivedAt: null }],
        }),
        world
      )
    ).toBe('Good');
    expect(
      formatFactValue(
        [{ targetKind: 'item', targetId: 'item-2' }],
        field({ kind: 'reference' }),
        world
      )
    ).toBe('Spare cable');
  });

  it('joins multiple values and leaves ordinary values readable', () => {
    expect(formatFactValue(['one', 'two'], field(), world)).toBe('one, two');
    expect(formatFactValue([42], field({ kind: 'integer' }), world)).toBe('42');
    expect(
      formatFactValue(
        [{ amount: '24.0000', unit: 'L' }],
        field({ kind: 'measurement', fixedUnit: 'L', presentation: { decimalPlaces: 1 } }),
        world
      )
    ).toBe('24.0 L');
  });

  it('returns null for an unset field', () => {
    expect(formatFactValue([], field(), world)).toBeNull();
  });
});
