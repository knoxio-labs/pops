import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseAddress } from './address';
import { CANVAS_FRAME_KEY, useCanvasFrame } from './use-canvas-frame';

import type { FrameKind } from '../frames/kind';
import type { Catalog, ScreenEntry } from '../registry';

function screen(id: string, frame?: FrameKind): ScreenEntry {
  const [area = '', slug = ''] = id.split('/');
  return { id, area, slug, title: id, order: 1, frame, experiments: [] };
}

const CATALOG: Catalog = {
  screens: [screen('mobile/receipt-detail', 'ios'), screen('finance/import-review')],
  experiments: [],
  errors: [],
};

function renderAt(path: string) {
  return renderHook(({ at }: { at: string }) => useCanvasFrame(CATALOG, parseAddress(at)), {
    initialProps: { at: path },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useCanvasFrame', () => {
  it('applies what the surface declares on arrival', () => {
    expect(renderAt('/s/mobile/receipt-detail').result.current[0]).toBe('ios');
  });

  it('keeps the stored frame where the surface declares nothing', () => {
    localStorage.setItem(CANVAS_FRAME_KEY, 'web');
    expect(renderAt('/s/finance/import-review').result.current[0]).toBe('web');
  });

  it('lets a hand-picked frame beat the declared one while you stay put', () => {
    const { result } = renderAt('/s/mobile/receipt-detail');
    act(() => {
      result.current[1]('web');
    });
    expect(result.current[0]).toBe('web');
  });

  it('keeps the hand-picked frame across a state change on the same surface', () => {
    const { result, rerender } = renderAt('/s/mobile/receipt-detail');
    act(() => {
      result.current[1]('web');
    });
    rerender({ at: '/s/mobile/receipt-detail?state=empty' });
    expect(result.current[0]).toBe('web');
  });

  it('re-applies the declared frame when you come back to the surface', () => {
    const { result, rerender } = renderAt('/s/mobile/receipt-detail');
    act(() => {
      result.current[1]('web');
    });
    rerender({ at: '/s/finance/import-review' });
    rerender({ at: '/s/mobile/receipt-detail' });
    // Arriving again is an arrival: the screen's own `ios` wins, rather than
    // a choice made on a previous visit following it around the session.
    expect(result.current[0]).toBe('ios');
  });

  it('carries a hand-picked frame to a surface that declares nothing', () => {
    const { result, rerender } = renderAt('/s/mobile/receipt-detail');
    act(() => {
      result.current[1]('web');
    });
    rerender({ at: '/s/finance/import-review' });
    expect(result.current[0]).toBe('web');
  });
});
