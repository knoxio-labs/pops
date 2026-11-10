import { describe, expect, it } from 'vitest';

import { sourcePlaces, sourceVisits } from '../stay/test-utils';
import { visitTitle } from './source-labels';
import { labels } from './test-utils';

describe('Visit occurrence labels', () => {
  it('uses actual route order and independent identities even for matching source names', () => {
    const first = sourceVisits[0]!;
    const second = { ...first, id: 90, placeId: 52 };
    const sources = {
      visits: [second, first],
      places: [...sourcePlaces, { ...sourcePlaces[0]!, id: 52 }],
      legs: new Map(),
    };
    expect(visitTitle(first, sources, labels)).toBe('Wellington · Visit 2');
    expect(visitTitle(second, sources, labels)).toBe('Wellington · Visit 1');
    expect(sources.visits.map((visit) => visit.id)).toEqual([90, 31]);
  });
  it('does not invent occurrence order or assert a resolved place when source context is absent', () => {
    expect(visitTitle(sourceVisits[0]!, {}, labels)).toBe('Place unavailable');
  });
});
