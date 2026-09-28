import { describe, expect, it } from 'vitest';

import { containerSegmentOptions } from './containers-model.js';

describe('containerSegmentOptions', () => {
  it('uses server counts while leaving Moving day uncounted', () => {
    const segments = containerSegmentOptions({
      all: 8,
      closed: 3,
      full: 2,
      moving: 5,
      open: 5,
      retired: 1,
    });

    expect(segments.map(({ id, count }) => ({ id, count }))).toEqual([
      { id: 'all', count: 8 },
      { id: 'open', count: 5 },
      { id: 'closed', count: 3 },
      { id: 'full', count: 2 },
      { id: 'moving', count: undefined },
      { id: 'retired', count: 1 },
    ]);
  });

  it('omits every count while the summary is unavailable', () => {
    expect(containerSegmentOptions(null).every((segment) => segment.count === undefined)).toBe(
      true
    );
  });
});
