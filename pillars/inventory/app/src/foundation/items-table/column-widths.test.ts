import { describe, expect, it } from 'vitest';

import {
  clampWidth,
  COLUMN_LIMITS,
  columnStyle,
  dragWidth,
  FIT_SLACK,
  fitWidth,
  KEYBOARD_STEP,
  nudgeWidth,
} from './column-widths';

describe('column widths', () => {
  it('clamps to each column’s limits and rounds to whole pixels', () => {
    expect(clampWidth('code', 10)).toBe(COLUMN_LIMITS.code.min);
    expect(clampWidth('code', 9999)).toBe(COLUMN_LIMITS.code.max);
    expect(clampWidth('where', 200.6)).toBe(201);
  });

  it('moves the edge by the drag distance in either direction', () => {
    expect(dragWidth('where', 200, 40)).toBe(240);
    expect(dragWidth('where', 200, -40)).toBe(160);
    expect(dragWidth('where', 200, -1000)).toBe(COLUMN_LIMITS.where.min);
  });

  it('nudges one keyboard step per press and stops at the limits', () => {
    expect(nudgeWidth('type', 120, 1)).toBe(120 + KEYBOARD_STEP);
    expect(nudgeWidth('type', 120, -1)).toBe(120 - KEYBOARD_STEP);
    expect(nudgeWidth('type', COLUMN_LIMITS.type.max, 1)).toBe(COLUMN_LIMITS.type.max);
  });

  it('fits the widest measured cell plus slack, rounding up', () => {
    expect(fitWidth('where', [120, 187.2, 90])).toBe(188 + FIT_SLACK);
  });

  it('fits within the limits when content is tiny or huge', () => {
    expect(fitWidth('where', [20])).toBe(COLUMN_LIMITS.where.min);
    expect(fitWidth('where', [5000])).toBe(COLUMN_LIMITS.where.max);
  });

  it('goes back to the minimum when there is nothing to measure', () => {
    expect(fitWidth('type', [])).toBe(COLUMN_LIMITS.type.min);
    expect(fitWidth('type', [0, 0])).toBe(COLUMN_LIMITS.type.min);
  });

  it('writes only the set widths as custom properties', () => {
    expect(columnStyle({ where: 240, code: 96 })).toEqual({
      '--col-where': '240px',
      '--col-code': '96px',
    });
    expect(columnStyle({})).toEqual({});
  });
});
