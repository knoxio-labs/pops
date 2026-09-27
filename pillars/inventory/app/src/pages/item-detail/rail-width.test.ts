import { describe, expect, it } from 'vitest';

import { clampRail, moveRail, RAIL_DEFAULT, RAIL_MAX, RAIL_MIN, RAIL_STEP } from './rail-width';

describe('item detail rail width', () => {
  it('keeps default inside allowed range', () => {
    expect(RAIL_MIN).toBeLessThan(RAIL_DEFAULT);
    expect(RAIL_DEFAULT).toBeLessThan(RAIL_MAX);
  });

  it('clamps to limits and rounds', () => {
    expect(clampRail(RAIL_MIN - 1)).toBe(RAIL_MIN);
    expect(clampRail(RAIL_MAX + 1)).toBe(RAIL_MAX);
    expect(clampRail(311.6)).toBe(312);
  });

  it('moves by drag distance either way and stops at limits', () => {
    expect(moveRail(RAIL_DEFAULT, RAIL_STEP)).toBe(RAIL_DEFAULT + RAIL_STEP);
    expect(moveRail(RAIL_DEFAULT, -RAIL_STEP)).toBe(RAIL_DEFAULT - RAIL_STEP);
    expect(moveRail(RAIL_MAX, 10)).toBe(RAIL_MAX);
    expect(moveRail(RAIL_MIN, -10)).toBe(RAIL_MIN);
  });
});
