import { describe, expect, it } from 'vitest';

import { listTrailState } from './list-trail.js';

describe('listTrailState', () => {
  it('preserves the list details and copies the item ids', () => {
    const ids = ['lamp', 'cable'];

    const state = listTrailState({ listName: 'In hand', href: '/inventory/in-hand', ids });

    expect(state).toEqual({
      listTrail: { listName: 'In hand', href: '/inventory/in-hand', ids: ['lamp', 'cable'] },
    });
    expect(state.listTrail.ids).not.toBe(ids);
  });
});
