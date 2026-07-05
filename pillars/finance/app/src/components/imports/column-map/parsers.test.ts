import { describe, expect, it } from 'vitest';

import { isEmptyColumnMap, type ColumnMap } from './parsers';

const emptyMap: ColumnMap = { date: '', description: '', amount: '' };

describe('isEmptyColumnMap', () => {
  it('treats a fully-unmapped map as empty', () => {
    expect(isEmptyColumnMap(emptyMap)).toBe(true);
  });

  it('treats any mapped required field as non-empty', () => {
    expect(isEmptyColumnMap({ ...emptyMap, date: 'Date' })).toBe(false);
    expect(isEmptyColumnMap({ ...emptyMap, description: 'Merchant' })).toBe(false);
    expect(isEmptyColumnMap({ ...emptyMap, amount: 'Value' })).toBe(false);
  });

  it('treats a location-only map as non-empty so auto-detect never clobbers it (#3621)', () => {
    expect(isEmptyColumnMap({ ...emptyMap, location: 'Town/City' })).toBe(false);
  });
});
