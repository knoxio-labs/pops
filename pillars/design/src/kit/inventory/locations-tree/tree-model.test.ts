import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import {
  childPlaces,
  createPlace,
  dropPlace,
  dropPlaceVerdict,
  kindForChild,
  movePlace,
  placeMoveVerdict,
  placeNameProblem,
  renamePlace,
  subtreeIds,
  tallyPlace,
} from './tree-model';

const names = (world = coreWorld, parent: string | null = 'loc-garage'): string[] =>
  childPlaces(world, parent).map((node) => node.name);

describe('tree order and subtrees', () => {
  it('lists children in tree order and roots for null', () => {
    expect(names()).toEqual(['Workbench', 'Shelving']);
    expect(names(coreWorld, null)).toEqual(['Wattle Street house', 'Offsite storage unit']);
  });

  it('walks a subtree parents first and returns nothing for an unknown place', () => {
    expect(subtreeIds(coreWorld, 'loc-garage')).toEqual([
      'loc-garage',
      'loc-workbench',
      'loc-toolbox',
      'loc-shelving',
    ]);
    expect(subtreeIds(coreWorld, 'loc-nowhere')).toEqual([]);
  });
});

describe('tallyPlace', () => {
  it('separates loose items, boxes, what is in the boxes, and the deep total', () => {
    expect(tallyPlace(coreWorld, 'loc-garage')).toEqual({
      places: 2,
      itemsHere: 1,
      boxesHere: 2,
      inBoxes: 5,
      total: 15,
    });
  });

  it('counts nested boxes inside a box here, and ignores inactive things', () => {
    const shelving = tallyPlace(coreWorld, 'loc-shelving');
    expect(shelving).toMatchObject({ itemsHere: 1, boxesHere: 1, inBoxes: 3 });
    const bay = tallyPlace(coreWorld, 'loc-storage-bay');
    expect(bay).toMatchObject({ itemsHere: 0, boxesHere: 1, inBoxes: 2, total: 3 });
  });

  it('counts a lost thing out of the deep total', () => {
    expect(tallyPlace(coreWorld, 'loc-hall')).toMatchObject({ places: 1, itemsHere: 0, total: 1 });
    expect(tallyPlace(coreWorld, 'loc-nowhere').total).toBe(0);
  });
});

describe('placeMoveVerdict', () => {
  it('refuses a place into itself or its own subtree, naming both', () => {
    expect(placeMoveVerdict(coreWorld, 'loc-garage', 'loc-garage')).toEqual({
      ok: false,
      reason: 'Cannot go inside itself.',
    });
    expect(placeMoveVerdict(coreWorld, 'loc-garage', 'loc-toolbox')).toEqual({
      ok: false,
      reason: 'Red toolbox is inside Garage.',
    });
  });

  it('refuses a no-op and unknown places, and allows the top level', () => {
    expect(placeMoveVerdict(coreWorld, 'loc-workbench', 'loc-garage')).toMatchObject({ ok: false });
    expect(placeMoveVerdict(coreWorld, 'loc-gone', null)).toMatchObject({ ok: false });
    expect(placeMoveVerdict(coreWorld, 'loc-workbench', 'loc-gone')).toMatchObject({ ok: false });
    expect(placeMoveVerdict(coreWorld, 'loc-workbench', null)).toEqual({ ok: true });
    expect(placeMoveVerdict(coreWorld, 'loc-workbench', 'loc-study')).toEqual({ ok: true });
  });
});

describe('names', () => {
  it('requires a name and refuses a sibling clash, case-insensitively', () => {
    expect(placeNameProblem(coreWorld, 'loc-garage', '   ')).toBe('Give the place a name.');
    expect(placeNameProblem(coreWorld, 'loc-garage', 'shelving')).toBe(
      'Garage already has a place called Shelving.'
    );
    expect(placeNameProblem(coreWorld, null, 'offsite storage unit')).toMatch(/^The top level/);
    expect(placeNameProblem(coreWorld, 'loc-study', 'Shelving')).toBeNull();
  });

  it('lets a place keep its own name when renamed', () => {
    expect(placeNameProblem(coreWorld, 'loc-garage', 'Shelving', 'loc-shelving')).toBeNull();
  });

  it('renames with trimming and refuses a clash by leaving the world alone', () => {
    const renamed = renamePlace(coreWorld, 'loc-shelving', '  Metal shelving ');
    expect(renamed.locations.get('loc-shelving')?.name).toBe('Metal shelving');
    expect(renamePlace(coreWorld, 'loc-shelving', 'Workbench')).toBe(coreWorld);
  });
});

describe('createPlace', () => {
  it('appends a child with the likely kind', () => {
    const next = createPlace(coreWorld, {
      id: 'loc-new',
      name: 'Pegboard',
      parentId: 'loc-garage',
    });
    expect(names(next)).toEqual(['Workbench', 'Shelving', 'Pegboard']);
    expect(next.locations.get('loc-new')?.kind).toBe('furniture');
  });

  it('refuses a duplicate id or name', () => {
    const base = { name: 'Pegboard', parentId: 'loc-garage' };
    expect(createPlace(coreWorld, { ...base, id: 'loc-garage' })).toBe(coreWorld);
    expect(createPlace(coreWorld, { ...base, id: 'loc-x', name: 'Shelving' })).toBe(coreWorld);
  });

  it('infers kinds down the tree', () => {
    expect(kindForChild(null)).toBe('property');
    expect(kindForChild(coreWorld.locations.get('loc-house') ?? null)).toBe('room');
    expect(kindForChild(coreWorld.locations.get('loc-desk') ?? null)).toBe('storage');
  });
});

describe('dropPlace', () => {
  it('reorders among siblings before or after a node', () => {
    const before = dropPlace(coreWorld, 'loc-shelving', 'loc-workbench', 'before');
    expect(names(before)).toEqual(['Shelving', 'Workbench']);
    const after = dropPlace(before, 'loc-shelving', 'loc-workbench', 'after');
    expect(names(after)).toEqual(['Workbench', 'Shelving']);
  });

  it('reparents inside a node and carries the subtree along', () => {
    const next = dropPlace(coreWorld, 'loc-workbench', 'loc-study', 'inside');
    expect(names(next, 'loc-study')).toEqual(['Desk', 'Filing cabinet', 'Workbench']);
    expect(next.locations.get('loc-toolbox')?.parentId).toBe('loc-workbench');
    expect(names(next)).toEqual(['Shelving']);
  });

  it('refuses dropping into its own subtree or onto itself', () => {
    expect(dropPlaceVerdict(coreWorld, 'loc-garage', 'loc-toolbox', 'inside')).toMatchObject({
      ok: false,
      reason: 'Red toolbox is inside Garage.',
    });
    expect(dropPlaceVerdict(coreWorld, 'loc-garage', 'loc-garage', 'after')).toMatchObject({
      ok: false,
    });
    expect(dropPlace(coreWorld, 'loc-garage', 'loc-toolbox', 'after')).toBe(coreWorld);
  });

  it('refuses a drop inside the parent it already has', () => {
    expect(dropPlaceVerdict(coreWorld, 'loc-shelving', 'loc-garage', 'inside')).toEqual({
      ok: false,
      reason: 'Already there.',
    });
  });
});

describe('movePlace', () => {
  it('moves to the end of the new parent, or refuses and returns the same world', () => {
    const next = movePlace(coreWorld, 'loc-desk', 'loc-garage');
    expect(names(next)).toEqual(['Workbench', 'Shelving', 'Desk']);
    expect(movePlace(coreWorld, 'loc-garage', 'loc-shelving')).toBe(coreWorld);
  });
});
