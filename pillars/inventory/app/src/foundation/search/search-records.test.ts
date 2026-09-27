import { describe, expect, it } from 'vitest';

import { purchaseDateText } from './search-records';

describe('purchaseDateText', () => {
  it('formats the UTC calendar day in Australian short-month style', () => {
    expect(purchaseDateText('2026-09-12T20:00:00.000Z')).toBe('12 Sept 2026');
  });
});
