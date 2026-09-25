import { describe, expect, it } from 'vitest';

import { clampRail, moveRail, RAIL_DEFAULT, RAIL_MAX, RAIL_MIN, RAIL_STEP } from './rail-width';

describe('facts rail width', () => {
  it('keeps the default inside the allowed range', () => {
    expect(clampRail(RAIL_DEFAULT)).toBe(RAIL_DEFAULT);
  });

  it('clamps to the limits and rounds', () => {
    expect(clampRail(10)).toBe(RAIL_MIN);
    expect(clampRail(9999)).toBe(RAIL_MAX);
    expect(clampRail(300.4)).toBe(300);
  });

  it('moves by the drag distance either way and stops at the limits', () => {
    expect(moveRail(300, 40)).toBe(340);
    expect(moveRail(300, -RAIL_STEP)).toBe(300 - RAIL_STEP);
    expect(moveRail(RAIL_MIN, -50)).toBe(RAIL_MIN);
  });
});
