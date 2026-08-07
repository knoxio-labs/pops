import { describe, expect, it } from 'vitest';

import { readTransactionDetails } from '../time.js';

describe('readTransactionDetails', () => {
  it('reads the POS, transaction number and instant from the footer line', () => {
    const stamp = readTransactionDetails('POS   066   TRANS   3184     20:39     24/07/2026');
    expect(stamp).toEqual({
      pos: '066',
      transaction: '3184',
      occurredAt: '2026-07-24T10:39:00.000Z',
      localDate: '24072026',
    });
  });

  it('applies standard time in winter and daylight time in summer', () => {
    // The same wall clock is a different instant either side of the DST
    // boundary. Hardcoding +10:00 gets the January reading an hour wrong;
    // hardcoding +11:00 gets the July one wrong. Roughly half a year of
    // shopping is misplaced either way.
    const winter = readTransactionDetails('POS 1 TRANS 1 12:00 24/07/2026');
    const summer = readTransactionDetails('POS 1 TRANS 1 12:00 24/01/2026');
    expect(winter?.occurredAt).toBe('2026-07-24T02:00:00.000Z');
    expect(summer?.occurredAt).toBe('2026-01-24T01:00:00.000Z');
  });

  it('keeps an evening shop on the day it happened', () => {
    // 20:39 in Sydney is 10:39 UTC the SAME day. Read as UTC it would be
    // 20:39 UTC, which is fine — but 23:30 local is 13:30 UTC, and reading
    // the local clock as an instant pushes a late shop into tomorrow, and a
    // month-end one into next month.
    const late = readTransactionDetails('POS 1 TRANS 1 23:30 31/07/2026');
    expect(late?.occurredAt).toBe('2026-07-31T13:30:00.000Z');
  });

  it('reads the date day-first, not month-first', () => {
    // 07/08/2026 is 7 August here and 8 July in the American reading. Both
    // parse, both look plausible, and only one is right.
    const stamp = readTransactionDetails('POS 1 TRANS 1 09:00 07/08/2026');
    expect(stamp?.occurredAt.slice(0, 10)).toBe('2026-08-06');
    expect(stamp?.localDate).toBe('07082026');
  });

  it('tolerates the irregular spacing the receipt actually prints', () => {
    expect(readTransactionDetails('POS 066 TRANS 3184 20:39 24/07/2026')?.transaction).toBe('3184');
    expect(readTransactionDetails('POS  06  TRANS  9  9:05  01/01/2026')?.pos).toBe('06');
  });

  it('returns null rather than a partial reading', () => {
    expect(readTransactionDetails(null)).toBeNull();
    expect(readTransactionDetails(undefined)).toBeNull();
    expect(readTransactionDetails('')).toBeNull();
    expect(readTransactionDetails('POS 066 TRANS 3184')).toBeNull();
    expect(readTransactionDetails('ABN 88 000 014 675, STORE 1034')).toBeNull();
  });
});
