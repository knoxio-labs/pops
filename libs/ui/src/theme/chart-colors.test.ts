import { describe, expect, it } from 'vitest';

import { CHART_CATEGORICAL_COLORS } from './chart-colors';

describe('CHART_CATEGORICAL_COLORS', () => {
  it('has seven entries, each a CSS var() reference into --chart-1..7', () => {
    expect(CHART_CATEGORICAL_COLORS).toHaveLength(7);
    CHART_CATEGORICAL_COLORS.forEach((entry, i) => {
      expect(entry).toBe(`var(--chart-${i + 1})`);
    });
  });

  it('contains no raw hex or hsl literals', () => {
    for (const entry of CHART_CATEGORICAL_COLORS) {
      expect(entry).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(entry).not.toMatch(/hsl\(/i);
    }
  });
});
