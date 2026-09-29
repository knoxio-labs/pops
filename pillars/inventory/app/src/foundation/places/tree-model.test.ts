import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
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
} from './tree-model.js';

import type { LocationModel } from '../model/model.js';

const place = (
  id: string,
  name: string,
  parentId: string | null = null,
  kind: LocationModel['kind'] = parentId === null ? 'property' : 'room'
): LocationModel => ({ id, name, parentId, kind });

function world(): ReturnType<typeof buildWorld> {
  return buildWorld(
    [],
    [
      place('home', 'Home'),
      place('garage', 'Garage', 'home'),
      place('toolbox', 'Red toolbox', 'garage', 'storage'),
      place('shelving', 'Shelving', 'home'),
      place('workbench', 'Workbench', 'home'),
      place('yard', 'Yard'),
    ]
  );
}

describe('place tree model', () => {
  it('lists children and walks a subtree in stored order', () => {
    const current = world();
    expect(childPlaces(current, 'home').map(({ id }) => id)).toEqual([
      'garage',
      'shelving',
      'workbench',
    ]);
    expect(subtreeIds(current, 'garage')).toEqual(['garage', 'toolbox']);
    expect(subtreeIds(current, 'missing')).toEqual([]);
  });

  it('refuses self, descendants, no-op moves, and sibling name clashes', () => {
    const current = world();
    expect(placeMoveVerdict(current, 'garage', 'toolbox')).toEqual({
      ok: false,
      reason: 'Red toolbox is inside Garage.',
    });
    expect(placeMoveVerdict(current, 'garage', 'garage')).toEqual({
      ok: false,
      reason: 'Cannot go inside itself.',
    });
    expect(placeMoveVerdict(current, 'garage', 'home')).toEqual({
      ok: false,
      reason: 'Already there.',
    });
    expect(placeNameProblem(current, 'home', ' shelving ')).toBe(
      'Home already has a place called Shelving.'
    );
    expect(placeNameProblem(current, 'home', '  ')).toBe('Give the place a name.');
  });

  it('trims valid names, infers kinds, and keeps invalid worlds unchanged', () => {
    const current = world();
    const added = createPlace(current, { id: 'drawer', name: ' Drawer ', parentId: 'toolbox' });
    expect(added.locations.get('drawer')).toEqual({
      id: 'drawer',
      name: 'Drawer',
      parentId: 'toolbox',
      kind: 'storage',
    });
    expect(kindForChild(null)).toBe('property');
    expect(kindForChild({ ...place('p', 'Property'), kind: 'property' })).toBe('room');
    expect(renamePlace(current, 'shelving', ' GARAGE ')).toBe(current);
    expect(renamePlace(current, 'shelving', ' Shelf ').locations.get('shelving')?.name).toBe(
      'Shelf'
    );
  });

  it('reorders siblings and moves a whole subtree inside another place', () => {
    const current = world();
    const reordered = dropPlace(current, 'workbench', 'shelving', 'before');
    expect(childPlaces(reordered, 'home').map(({ id }) => id)).toEqual([
      'garage',
      'workbench',
      'shelving',
    ]);
    const nested = dropPlace(reordered, 'garage', 'workbench', 'inside');
    expect(nested.locations.get('garage')?.parentId).toBe('workbench');
    expect(subtreeIds(nested, 'workbench')).toEqual(['workbench', 'garage', 'toolbox']);
    expect(dropPlaceVerdict(current, 'garage', 'toolbox', 'inside')).toEqual({
      ok: false,
      reason: 'Red toolbox is inside Garage.',
    });
  });

  it('moves a place to the end of its new parent without splitting descendants', () => {
    const moved = movePlace(world(), 'garage', 'yard');
    expect(childPlaces(moved, 'yard').map(({ id }) => id)).toEqual(['garage']);
    expect(subtreeIds(moved, 'garage')).toEqual(['garage', 'toolbox']);
  });
});
