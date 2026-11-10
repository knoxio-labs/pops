import { describe, expect, it } from 'vitest';

import { decodeTripsCursor, tripsPage } from '../cursor.js';
import { tripsFixture } from './fixtures.js';

describe('Trips list snapshot cursors', () => {
  it('walks the entire original order without a hidden aggregate cap or merging equal names', () => {
    const source = tripsFixture().trip;
    const trips = Array.from({ length: 207 }, (_, index) => ({ ...source, id: index + 1 }));
    const seen: number[] = [];
    let cursor = null;
    do {
      const page = tripsPage(trips, 100, cursor);
      expect(page?.totalCount).toBe(207);
      if (page === null) throw new Error('Expected a valid page');
      seen.push(...page.items.map((trip) => trip.id));
      cursor = page.nextCursor === null ? null : decodeTripsCursor(page.nextCursor);
    } while (cursor !== null);
    expect(seen).toEqual(trips.map((trip) => trip.id));
  });

  it('rejects a changed source snapshot rather than repeating or skipping offset rows', () => {
    const source = tripsFixture().trip;
    const trips = [source, { ...source, id: 8 }];
    const first = tripsPage(trips, 1, null);
    if (first?.nextCursor === null || first?.nextCursor === undefined)
      throw new Error('Expected continuation');
    const cursor = decodeTripsCursor(first.nextCursor);
    expect(cursor).not.toBeNull();
    expect(tripsPage([{ ...source, id: 9 }, ...trips], 1, cursor)).toBeNull();
    expect(
      tripsPage(
        [{ ...source, when: 'Changed source text' }, trips[1]].filter((trip) => trip !== undefined),
        1,
        cursor
      )
    ).toBeNull();
  });

  it('ends on genuine empty/last pages and rejects malformed cursors or invalid page sizes', () => {
    expect(tripsPage([], 25, null)).toEqual({ items: [], nextCursor: null, totalCount: 0 });
    expect(tripsPage([tripsFixture().trip], 1, null)?.nextCursor).toBeNull();
    expect(decodeTripsCursor('not-a-cursor')).toBeNull();
    expect(
      decodeTripsCursor(
        Buffer.from(JSON.stringify({ v: 1, offset: -1, snapshot: 'x' })).toString('base64url')
      )
    ).toBeNull();
    expect(tripsPage([], 0, null)).toBeNull();
  });
});
