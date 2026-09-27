import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, coreWorld, item } from '../test-fixtures/core.js';
import { roomOf } from './room-of.js';

describe('roomOf', () => {
  it('names the room above a nested place and In hand for an item in hand', () => {
    expect(roomOf(coreWorld, 'itm-lamp')).toEqual({ id: 'loc-study', name: 'Study' });
    expect(roomOf(coreWorld, 'itm-tape')).toEqual({ id: 'in-hand', name: 'In hand' });
  });

  it("reads a boxed item's room through its container", () => {
    expect(roomOf(coreWorld, 'itm-usbc')).toEqual({ id: 'loc-garage', name: 'Garage' });
  });

  it('finds a room below an intermediate location group', () => {
    const world = buildWorld(
      [item(['itm-bedroom', 'Bedroom item', null], at('bedroom'))],
      [
        { id: 'property', name: 'Property', parentId: null, kind: 'property' },
        { id: 'upstairs', name: 'Upstairs', parentId: 'property', kind: 'area' },
        { id: 'bedroom', name: 'Bedroom', parentId: 'upstairs', kind: 'room' },
      ]
    );

    expect(roomOf(world, 'itm-bedroom')).toEqual({ id: 'bedroom', name: 'Bedroom' });
  });
});
