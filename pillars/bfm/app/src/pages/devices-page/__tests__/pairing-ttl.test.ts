import { describe, expect, it } from 'vitest';

import { formatRemaining } from '../PairingDialog';
import { remainingUntil } from '../usePairingCode';

/**
 * The clock is a parameter here rather than a timer, so these can pin exact
 * values. The integrated countdown in `DevicesPage.test.tsx` cannot: it runs
 * against a fake clock that real elapsed time leaks into, and asserting an
 * exact readout there buys a flake, not a stronger test.
 */

const NOON = Date.parse('2026-08-08T12:00:00.000Z');

describe('remainingUntil', () => {
  it('returns the gap to the deadline', () => {
    expect(remainingUntil('2026-08-08T12:05:00.000Z', NOON)).toBe(300_000);
  });

  it('clamps a passed deadline to zero rather than going negative', () => {
    expect(remainingUntil('2026-08-08T11:59:00.000Z', NOON)).toBe(0);
  });

  it('treats the deadline instant itself as spent', () => {
    expect(remainingUntil('2026-08-08T12:00:00.000Z', NOON)).toBe(0);
  });

  /**
   * The safe direction. A code whose deadline cannot be read would otherwise
   * sit on screen indefinitely, looking valid — the exact failure the
   * countdown exists to prevent.
   */
  it('treats an unparseable deadline as already expired', () => {
    expect(remainingUntil('not-a-date', NOON)).toBe(0);
    expect(remainingUntil('', NOON)).toBe(0);
  });

  it('reads an offset-bearing deadline as the same instant as its UTC form', () => {
    expect(remainingUntil('2026-08-08T22:05:00.000+10:00', NOON)).toBe(300_000);
  });
});

describe('formatRemaining', () => {
  it.each([
    [300_000, '5:00'],
    [125_000, '2:05'],
    [65_000, '1:05'],
    [60_000, '1:00'],
    [9_000, '0:09'],
    [0, '0:00'],
  ])('renders %ims as %s', (remainingMs, expected) => {
    expect(formatRemaining(remainingMs)).toBe(expected);
  });

  /**
   * Floored, not rounded. Rounding would show `1:00` on a code with 59.6s left
   * and, worse, `0:00` on one that still works.
   */
  it('floors rather than rounds', () => {
    expect(formatRemaining(59_999)).toBe('0:59');
    expect(formatRemaining(60_999)).toBe('1:00');
  });

  it('never renders a negative clock', () => {
    expect(formatRemaining(-5_000)).toBe('0:00');
  });
});
