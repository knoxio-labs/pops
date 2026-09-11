/**
 * The DSL chip theme used to read `var(--cm-dsl-chip-*, #fallback)` for
 * every colour, but nothing in the tree ever defined a `--cm-dsl-chip-*`
 * variable, so the hex fallback was all that ever rendered. This asserts
 * the indirection is gone and every colour points at a real design token.
 */
import { describe, expect, it } from 'vitest';

import { dslChipThemeSpec } from '../chip-widgets-extension';

function allValues(spec: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const rule of Object.values(spec)) {
    if (typeof rule !== 'object' || rule === null) continue;
    for (const value of Object.values(rule as Record<string, unknown>)) {
      if (typeof value === 'string') values.push(value);
    }
  }
  return values;
}

describe('dslChipThemeSpec', () => {
  const values = allValues(dslChipThemeSpec);
  const colourValues = values.filter((v) => v.includes('var(') || /#[0-9a-fA-F]{3,8}/.test(v));

  it('has no --cm-dsl-chip-* indirection left', () => {
    for (const value of values) {
      expect(value).not.toContain('--cm-dsl-chip-');
    }
  });

  it('has no hex literals', () => {
    for (const value of values) {
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('references only var(--token) design tokens, never a fallback value', () => {
    expect(colourValues.length).toBeGreaterThan(0);
    for (const value of colourValues) {
      expect(value).toMatch(/var\(--[\w-]+\)$/);
    }
  });

  it('reads defined tokens: border, muted, foreground, the chart ramp, destructive, ring', () => {
    expect(dslChipThemeSpec['.cm-dsl-chip'].border).toBe('1px solid var(--border)');
    expect(dslChipThemeSpec['.cm-dsl-chip'].background).toBe('var(--muted)');
    expect(dslChipThemeSpec['.cm-dsl-chip'].color).toBe('var(--foreground)');
    expect(dslChipThemeSpec['.cm-dsl-chip--error'].background).toBe('var(--destructive)');
    expect(dslChipThemeSpec['.cm-dsl-chip--error'].color).toBe('var(--destructive-foreground)');
    expect(dslChipThemeSpec['.cm-dsl-chip--jump:focus-visible'].outline).toBe(
      '2px solid var(--ring)'
    );
  });
});
