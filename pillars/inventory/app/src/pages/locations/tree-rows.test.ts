import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { revealIds, stepRow, treeRows } from './tree-rows.js';

import type { LocationModel } from '../../foundation/model/model.js';

function place(
  id: string,
  parentId: string | null,
  name = id,
  kind: LocationModel['kind'] = 'room'
): LocationModel {
  return { id, name, parentId, kind };
}

function world(): ReturnType<typeof buildWorld> {
  return buildWorld(
    [],
    [
      place('home', null, 'Home', 'property'),
      place('living', 'home', 'Living room'),
      place('shelf', 'living', 'Shelf', 'furniture'),
      place('garage', 'home', 'Garage'),
      place('garden', null, 'Garden', 'area'),
    ]
  );
}

describe('treeRows', () => {
  it('draws roots first and children only when their parent is expanded', () => {
    const rows = treeRows(world(), new Set(['home']));

    expect(rows.map((row) => [row.node.id, row.depth, row.expanded])).toEqual([
      ['home', 0, true],
      ['living', 1, false],
      ['garage', 1, false],
      ['garden', 0, false],
    ]);
  });

  it('draws grandchildren after every expanded ancestor', () => {
    const rows = treeRows(world(), new Set(['home', 'living']));

    expect(rows.map((row) => row.node.id)).toEqual(['home', 'living', 'shelf', 'garage', 'garden']);
    expect(rows[2]?.depth).toBe(2);
  });

  it('keeps matching descendants and their ancestors visible', () => {
    const rows = treeRows(world(), new Set(), 'shelf');

    expect(rows.map((row) => row.node.id)).toEqual(['home', 'living', 'shelf']);
    expect(rows.map((row) => row.matched)).toEqual([false, false, true]);
    expect(rows.every((row) => row.expanded || !row.hasChildren)).toBe(true);
  });

  it('matches location names without case sensitivity or surrounding whitespace', () => {
    const rows = treeRows(world(), new Set(), '  GAR  ');

    expect(rows.map((row) => row.node.id)).toEqual(['home', 'garage', 'garden']);
    expect(rows[1]?.matched).toBe(true);
    expect(rows[2]?.matched).toBe(true);
  });

  it('returns no rows when the filter has no match', () => {
    expect(treeRows(world(), new Set(), 'attic')).toEqual([]);
  });

  it('reveals only ancestors and handles an unknown location safely', () => {
    expect(revealIds(world(), 'shelf')).toEqual(['home', 'living']);
    expect(revealIds(world(), 'missing')).toEqual([]);
  });

  it('steps through visible rows and clamps at both ends', () => {
    const rows = treeRows(world(), new Set(['home']));

    expect(stepRow(rows, null, 1)).toBe('home');
    expect(stepRow(rows, 'home', -1)).toBe('home');
    expect(stepRow(rows, 'garden', 1)).toBe('garden');
    expect(stepRow(rows, 'missing', -1)).toBe('home');
    expect(stepRow([], 'home', 1)).toBeNull();
  });
});
