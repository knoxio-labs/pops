import { describe, expect, it } from 'vitest';

import { reportsSearchWith } from './report-model.js';

describe('reportsSearchWith', () => {
  it("appends a tab's own search to the tab", () => {
    expect(reportsSearchWith('insurance', '?gaps=1')).toBe('?tab=insurance&gaps=1');
    expect(reportsSearchWith('insurance', '')).toBe('?tab=insurance');
    expect(reportsSearchWith('overview', '')).toBe('');
    expect(reportsSearchWith('overview', '?gaps=1')).toBe('?gaps=1');
  });
});
