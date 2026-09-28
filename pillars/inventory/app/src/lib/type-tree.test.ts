import { describe, expect, it } from 'vitest';

import {
  ancestorIds,
  descendantIds,
  effectiveCapabilities,
  effectiveFields,
  MAX_TYPE_TREE_DEPTH,
  typeDepth,
  typeHeight,
  typePath,
} from './type-tree';

import type { CatalogueField, CatalogueType } from '../catalogue-editor/types';

const field = (id: string, typeId: string, key: string, sortOrder: number): CatalogueField => ({
  allowOverride: false,
  archivedAt: null,
  cardinality: 'one',
  defaultValues: [],
  enumOptions: [],
  expression: null,
  expressionVersion: null,
  fixedUnit: null,
  help: null,
  id,
  key,
  kind: 'short_text',
  label: key,
  presentation: {},
  referenceKinds: [],
  referenceTypeIds: [],
  replacedBy: null,
  required: false,
  sortOrder,
  storage: 'stored',
  typeId,
});

const type = (
  id: string,
  label: string,
  parentTypeId: string | null,
  fields: readonly CatalogueField[] = [],
  archivedAt: string | null = null
): CatalogueType => ({
  archivedAt,
  capabilities: [],
  description: null,
  fields: [...fields],
  id,
  key: id,
  label,
  legacyLabels: [],
  parentTypeId,
  presentation: {},
  replacedBy: null,
  revision: 1,
  sortOrder: 0,
});

describe('type-tree', () => {
  it('returns depth, height and path for a three-level chain', () => {
    const types = [
      type('root', 'Bedding', null),
      type('middle', 'Pillows', 'root'),
      type('leaf', 'Pillowcase', 'middle'),
    ];

    expect(MAX_TYPE_TREE_DEPTH).toBe(3);
    expect(ancestorIds(types, 'leaf')).toEqual(['root', 'middle']);
    expect(typeDepth(types, 'leaf')).toBe(3);
    expect(typeHeight(types, 'root')).toBe(3);
    expect(typePath(types, 'leaf')).toEqual(['Bedding', 'Pillows', 'Pillowcase']);
  });

  it('terminates on a cycle', () => {
    const types = [type('a', 'A', 'b'), type('b', 'B', 'a')];

    expect(ancestorIds(types, 'a')).toEqual(['b']);
    expect(typePath(types, 'a')).toEqual(['B', 'A']);
    expect(typeHeight(types, 'a')).toBe(2);
    expect(descendantIds(types, 'a')).toEqual(['b']);
  });

  it('includes archived descendants', () => {
    const types = [
      type('root', 'Bedding', null),
      type('child', 'Sheet', 'root', [], '2026-09-26T00:00:00.000Z'),
    ];

    expect(descendantIds(types, 'root')).toEqual(['child']);
  });

  it('returns no descendants for an unknown type', () => {
    const types = [type('root', 'Bedding', null), type('child', 'Sheet', 'root')];

    expect(descendantIds(types, 'missing')).toEqual([]);
  });

  it('orders effective fields by ancestor and then sort order and key', () => {
    const types = [
      type('root', 'Bedding', null, [
        field('root-z', 'root', 'zulu', 1),
        field('root-a', 'root', 'alpha', 1),
      ]),
      type('child', 'Sheet', 'root', [field('child-a', 'child', 'fitted', 0)]),
      type('leaf', 'Pillowcase', 'child', [field('leaf-a', 'leaf', 'closure', 0)]),
    ];

    expect(effectiveFields(types, 'leaf').map(({ id }) => id)).toEqual([
      'root-a',
      'root-z',
      'child-a',
      'leaf-a',
    ]);
  });

  it('inherits capabilities, expands reference targets, and lets a child replace a field', () => {
    const sharedParent = field('shared', 'root', 'parent-name', 0);
    const reference = {
      ...field('reference', 'root', 'related', 1),
      kind: 'reference' as const,
      referenceTypeIds: ['root'],
    };
    const parent = {
      ...type('root', 'Bedding', null, [sharedParent, reference]),
      capabilities: ['containment'],
    };
    const child = {
      ...type('child', 'Sheet', 'root', [field('shared', 'child', 'child-name', 0)]),
      capabilities: [],
    };
    const leaf = type('leaf', 'Fitted sheet', 'child');

    const resolved = effectiveFields([parent, child, leaf], 'leaf');

    expect(resolved.map(({ id, label }) => [id, label])).toEqual([
      ['shared', 'child-name'],
      ['reference', 'related'],
    ]);
    expect(effectiveCapabilities([parent, child, leaf], 'leaf')).toEqual(['containment']);
    expect(resolved.find((candidate) => candidate.id === 'reference')?.referenceTypeIds).toEqual([
      'root',
      'child',
      'leaf',
    ]);
  });

  it('stops at a missing parent', () => {
    const types = [type('child', 'Orphan', 'missing')];

    expect(ancestorIds(types, 'child')).toEqual([]);
    expect(typePath(types, 'child')).toEqual(['Orphan']);
    expect(effectiveFields(types, 'child')).toEqual([]);
  });
});
