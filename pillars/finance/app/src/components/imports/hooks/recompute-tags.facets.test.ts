import { describe, expect, it } from 'vitest';

import { mergeRecomputedTags } from './recompute-tags';

describe('mergeRecomputedTags — single-valued facets (POPS-3668)', () => {
  it('keeps one venue, the fresh rule’s, and still unions contains', () => {
    const merged = mergeRecomputedTags(
      [
        { tag: 'venue:takeaway', source: 'ai' },
        { tag: 'contains:food', source: 'ai' },
      ],
      [
        { tag: 'venue:restaurant', source: 'rule' },
        { tag: 'contains:alcohol', source: 'rule' },
      ]
    );
    expect(merged.map((s) => s.tag)).toEqual([
      'venue:restaurant',
      'contains:alcohol',
      'contains:food',
    ]);
  });
});
