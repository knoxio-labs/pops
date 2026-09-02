import { describe, expect, it } from 'vitest';

import { applyThemeToDocument, decodeTheme, encodeTheme, themeClasses, themeLabel } from './theme';

describe('theme encoding', () => {
  it('round-trips mode and accent', () => {
    for (const theme of [
      { mode: 'dark' as const },
      { mode: 'light' as const, accent: 'sky' as const },
    ]) {
      expect(decodeTheme(encodeTheme(theme))).toEqual(theme);
    }
  });

  it('falls back to the default on anything unrecognised', () => {
    expect(decodeTheme(null)).toEqual({ mode: 'dark' });
    expect(decodeTheme('sepia')).toEqual({ mode: 'dark' });
    expect(decodeTheme('light+neon')).toEqual({ mode: 'light' });
  });

  it('realises a theme as the product’s own classes', () => {
    expect(themeClasses({ mode: 'dark' })).toEqual(['dark']);
    expect(themeClasses({ mode: 'light', accent: 'emerald' })).toEqual(['app-emerald']);
    expect(themeLabel({ mode: 'dark', accent: 'rose' })).toBe('Dark · rose');
  });

  it('replaces the previous theme classes on the document instead of stacking them', () => {
    applyThemeToDocument(document, { mode: 'dark', accent: 'rose' });
    applyThemeToDocument(document, { mode: 'light', accent: 'sky' });
    const classes = [...document.documentElement.classList];
    expect(classes).toContain('app-sky');
    expect(classes).not.toContain('app-rose');
    expect(classes).not.toContain('dark');
  });
});
