import { describe, expect, it } from 'vitest';

import {
  frameFromSearch,
  frameSize,
  fromFrameRoute,
  FULL,
  rotated,
  themeFromSearch,
  toFrameRoute,
  viewportLabel,
  type Viewport,
} from './viewport';

describe('viewportLabel', () => {
  it('labels full, fixed and ratio viewports', () => {
    expect(viewportLabel(FULL)).toBe('Full');
    expect(viewportLabel({ kind: 'fixed', label: 'Phone', w: 390, h: 844 })).toBe('Phone 390×844');
    expect(viewportLabel({ kind: 'ratio', label: '16:9', rw: 16, rh: 9 })).toBe('16:9');
  });
});

describe('rotated', () => {
  it('swaps the sides of fixed and ratio viewports, and is its own inverse', () => {
    const phone: Viewport = { kind: 'fixed', label: 'Phone', w: 390, h: 844 };
    expect(rotated(phone)).toEqual({ ...phone, w: 844, h: 390 });
    expect(rotated(rotated(phone))).toEqual(phone);
    expect(rotated({ kind: 'ratio', label: '16:9', rw: 16, rh: 9 })).toEqual({
      kind: 'ratio',
      label: '16:9',
      rw: 9,
      rh: 16,
    });
    expect(rotated(FULL)).toEqual(FULL);
  });
});

describe('frameSize', () => {
  it('passes fixed sizes through and fits ratios to the tighter axis', () => {
    expect(frameSize({ kind: 'fixed', label: 'P', w: 390, h: 844 }, { w: 1000, h: 1000 })).toEqual({
      w: 390,
      h: 844,
    });
    expect(frameSize({ kind: 'ratio', label: '1:1', rw: 1, rh: 1 }, { w: 1000, h: 600 })).toEqual({
      w: 600,
      h: 600,
    });
  });
});

describe('frame route encoding', () => {
  it('prefixes the route and carries the theme and chrome as query parameters', () => {
    expect(toFrameRoute('/s/a/b', { mode: 'dark' }, 'none')).toBe(
      '/frame/s/a/b?theme=dark&frame=none'
    );
    expect(toFrameRoute('/s/a/b?state=empty', { mode: 'light', accent: 'rose' }, 'web')).toBe(
      '/frame/s/a/b?state=empty&theme=light%2Brose&frame=web'
    );
  });

  it('strips the prefix and both chrome parameters, keeping the rest of the query', () => {
    expect(fromFrameRoute('/frame/s/a/b', '?theme=dark&frame=web')).toBe('/s/a/b');
    expect(fromFrameRoute('/frame/s/a/b', '?state=empty&theme=dark&frame=web')).toBe(
      '/s/a/b?state=empty'
    );
    expect(fromFrameRoute('/s/a/b')).toBe('/s/a/b');
  });

  it('reads the theme a frame was opened with', () => {
    expect(themeFromSearch('?theme=light%2Brose')).toEqual({ mode: 'light', accent: 'rose' });
    expect(themeFromSearch('')).toEqual({ mode: 'dark' });
  });

  it('reads the chrome a frame was opened with, and treats anything else as none', () => {
    expect(frameFromSearch('?frame=web')).toBe('web');
    expect(frameFromSearch('?frame=ios')).toBe('none');
    expect(frameFromSearch('?frame=android')).toBe('none');
    expect(frameFromSearch('')).toBe('none');
  });
});
