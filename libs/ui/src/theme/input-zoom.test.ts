import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('coarse-pointer form control typography', () => {
  it('keeps the 16px backstop outside CSS layers after utility definitions', () => {
    const css = readFileSync('src/theme/globals.css', 'utf8');
    const rule = css.indexOf('@media (pointer: coarse)');
    expect(rule).toBeGreaterThan(css.lastIndexOf('@utility'));
    expect(css.slice(rule)).toMatch(
      /input:not\(\[type='checkbox'\], \[type='radio'\], \[type='range'\]\),\s*select,\s*textarea\s*\{\s*font-size: max\(16px, 1em\);/
    );
  });
});
