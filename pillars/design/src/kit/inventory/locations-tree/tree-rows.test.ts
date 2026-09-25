import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { revealIds, stepRow, treeRows } from './tree-rows';

const labels = (rows: ReturnType<typeof treeRows>): string[] =>
  rows.map((row) => `${'-'.repeat(row.depth)}${row.node.name}`);

describe('treeRows', () => {
  it('draws roots only when nothing is expanded', () => {
    expect(labels(treeRows(coreWorld, new Set()))).toEqual([
      'Wattle Street house',
      'Offsite storage unit',
    ]);
  });

  it('opens expanded nodes depth first, and says which rows have children', () => {
    const rows = treeRows(coreWorld, new Set(['loc-house', 'loc-garage']));
    expect(labels(rows).slice(0, 3)).toEqual(['Wattle Street house', '-Living room', '-Study']);
    expect(labels(rows)).toContain('--Workbench');
    expect(labels(rows)).not.toContain('---Red toolbox');
    const garage = rows.find((row) => row.node.id === 'loc-garage');
    expect(garage).toMatchObject({ hasChildren: true, expanded: true, depth: 1 });
    const hall = rows.find((row) => row.node.id === 'loc-hall');
    expect(hall).toMatchObject({ hasChildren: true, expanded: false });
  });

  it('never marks a leaf expanded, even if its id is in the set', () => {
    const rows = treeRows(coreWorld, new Set(['loc-storage', 'loc-storage-bay']));
    expect(rows.find((row) => row.node.id === 'loc-storage-bay')?.expanded).toBe(false);
  });

  it('filters to matches and their ancestors, opened, whatever is expanded', () => {
    const rows = treeRows(coreWorld, new Set(), 'drawer');
    expect(labels(rows)).toEqual([
      'Wattle Street house',
      '-Living room',
      '--TV unit',
      '---Left drawer',
    ]);
    expect(rows.map((row) => row.matched)).toEqual([false, false, false, true]);
  });

  it('draws nothing when the filter matches nothing', () => {
    expect(treeRows(coreWorld, new Set(), 'attic')).toEqual([]);
  });
});

describe('revealIds and stepRow', () => {
  it('lists the ancestors that must open for a place to show', () => {
    expect(revealIds(coreWorld, 'loc-toolbox')).toEqual([
      'loc-house',
      'loc-garage',
      'loc-workbench',
    ]);
    expect(revealIds(coreWorld, 'loc-house')).toEqual([]);
  });

  it('steps through rows and stops at the ends', () => {
    const rows = treeRows(coreWorld, new Set(['loc-house']));
    expect(stepRow(rows, 'loc-house', 1)).toBe('loc-living');
    expect(stepRow(rows, 'loc-house', -1)).toBe('loc-house');
    expect(stepRow(rows, 'loc-storage', 1)).toBe('loc-storage');
    expect(stepRow(rows, null, 1)).toBe('loc-house');
    expect(stepRow([], null, 1)).toBeNull();
  });
});
