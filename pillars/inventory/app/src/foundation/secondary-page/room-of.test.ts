import { describe, expect, it } from 'vitest';

import { coreWorld } from '../test-fixtures/core.js';
import { roomOf } from './room-of.js';

describe('roomOf', () => {
  it('names the room above a nested place and In hand for an item in hand', () => {
    expect(roomOf(coreWorld, 'itm-lamp')).toEqual({ id: 'loc-study', name: 'Study' });
    expect(roomOf(coreWorld, 'itm-tape')).toEqual({ id: 'in-hand', name: 'In hand' });
  });

  it("reads a boxed item's room through its container", () => {
    expect(roomOf(coreWorld, 'itm-usbc')).toEqual({ id: 'loc-garage', name: 'Garage' });
  });
});
