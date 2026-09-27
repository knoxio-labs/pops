import { describe, expect, it } from 'vitest';

import { listTrailState, readListTrail, trailPosition } from './list-trail';

const trail = {
  listName: 'Items',
  href: '/inventory/items?q=lead',
  ids: ['item-1', 'item-2', 'item-3'],
};

describe('list trail', () => {
  it('reads a trail from router state and ignores anything malformed', () => {
    expect(readListTrail(listTrailState(trail))).toEqual(trail);
    expect(readListTrail(null)).toBeNull();
    expect(readListTrail({ listTrail: { ...trail, ids: ['item-1', 2] } })).toBeNull();
    expect(readListTrail({ listTrail: { ...trail, href: '' } })).toBeNull();
    expect(readListTrail({ listTrail: trail.ids })).toBeNull();
  });

  it('trailPosition gives the 1-based index and neighbours, null at the ends and for an unknown id', () => {
    expect(trailPosition(trail, 'item-2')).toEqual({
      listName: 'Items',
      href: '/inventory/items?q=lead',
      index: 2,
      total: 3,
      previousId: 'item-1',
      nextId: 'item-3',
    });
    expect(trailPosition(trail, 'item-1')?.previousId).toBeNull();
    expect(trailPosition(trail, 'item-3')?.nextId).toBeNull();
    expect(trailPosition(trail, 'missing')).toBeNull();
    expect(trailPosition(null, 'item-1')).toBeNull();
  });
});
