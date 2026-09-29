import { describe, expect, it } from 'vitest';

import { chipCounts, historyKinds, parseHistoryFilter } from './history-model.js';

describe('item history filters', () => {
  it('parses the URL filter and falls back to all', () => {
    expect(parseHistoryFilter('placement')).toBe('placement');
    expect(parseHistoryFilter('unknown')).toBe('all');
    expect(parseHistoryFilter(null)).toBe('all');
  });

  it('uses the server contract kinds for each non-all query', () => {
    expect(historyKinds('all')).toBeUndefined();
    expect(historyKinds('placement')).toEqual([
      'moved',
      'stored',
      'picked_up',
      'put_back',
      'opened',
      'closed',
    ]);
  });

  it('sums server kind counts into chip counts without inspecting event rows', () => {
    expect(
      chipCounts({ created: 1, moved: 2, stored: 3, lifecycle_changed: 4, restored: 5 }, 15)
    ).toEqual({ all: 15, placement: 5, details: 1, lifecycle: 9 });
  });
});
