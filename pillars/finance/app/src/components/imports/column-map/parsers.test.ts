import { describe, expect, it } from 'vitest';

import { isEmptyColumnMap, parseDate, type ColumnMap } from './parsers';

const emptyMap: ColumnMap = { date: '', description: '', amount: '' };

describe('parseDate', () => {
  it('reads a DMY export with the day first', () => {
    expect(parseDate('31/07/2026', 'DMY')).toBe('2026-07-31');
  });

  it('reads an MDY export with the month first', () => {
    expect(parseDate('07/31/2026', 'MDY')).toBe('2026-07-31');
  });

  it('would silently transpose an ambiguous date under the wrong order (#havoc)', () => {
    // 03/07/2026 is unambiguous only once the order is known: DMY reads it as
    // 3 July, MDY as 7 March. Both parse successfully — nothing here can catch
    // a caller that passes the wrong order, which is why every dialect must
    // declare its own rather than one being assumed for all.
    expect(parseDate('03/07/2026', 'DMY')).toBe('2026-07-03');
    expect(parseDate('03/07/2026', 'MDY')).toBe('2026-03-07');
  });

  it('rejects a string that is not three slash-delimited parts', () => {
    expect(parseDate('2026-07-31', 'DMY')).toBeNull();
    expect(parseDate(undefined, 'DMY')).toBeNull();
  });
});

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
