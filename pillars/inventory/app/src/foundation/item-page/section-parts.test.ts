import { describe, expect, it } from 'vitest';

import { dateTime, shortDate } from './section-parts';

describe('item detail section date helpers', () => {
  it('formats a short local date', () => {
    expect(shortDate('2026-09-01T05:06:00.000Z')).toMatch(/1 Sep/u);
  });

  it('formats a local date and time without seconds', () => {
    const formatted = dateTime('2026-09-01T05:06:00.000Z');
    expect(formatted).toMatch(/1 Sep/u);
    expect(formatted).not.toMatch(/00 seconds|:00\./u);
  });
});
