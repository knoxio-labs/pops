import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeScreen } from '../test/factories';
import { parseAddress } from './address';
import { CANVAS_FRAME_KEY, useCanvasFrame } from './use-canvas-frame';

import type { FrameKind } from '../frames/kind';
import type { Catalog, ScreenEntry } from '../registry';

function screen(id: string, frame?: FrameKind): ScreenEntry {
  return makeScreen({ id, title: id, order: 1, frame });
}

const CATALOG: Catalog = {
  screens: [screen('finance/account-detail', 'web'), screen('finance/import-review')],
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
    expect(renderAt('/s/finance/account-detail').result.current[0]).toBe('web');
  });

  it('keeps the stored frame where the surface declares nothing', () => {
    localStorage.setItem(CANVAS_FRAME_KEY, 'web');
    expect(renderAt('/s/finance/import-review').result.current[0]).toBe('web');
  });

  it('lets a hand-picked frame beat the declared one while you stay put', () => {
    const { result } = renderAt('/s/finance/account-detail');
    act(() => {
      result.current[1]('none');
    });
    expect(result.current[0]).toBe('none');
  });

  it('keeps the hand-picked frame across a state change on the same surface', () => {
    const { result, rerender } = renderAt('/s/finance/account-detail');
    act(() => {
      result.current[1]('none');
    });
    rerender({ at: '/s/finance/account-detail?state=empty' });
    expect(result.current[0]).toBe('none');
  });

  it('re-applies the declared frame when you come back to the surface', () => {
    const { result, rerender } = renderAt('/s/finance/account-detail');
    act(() => {
      result.current[1]('none');
    });
    rerender({ at: '/s/finance/import-review' });
    rerender({ at: '/s/finance/account-detail' });
    // Arriving again is an arrival: the screen's own `web` wins, rather than
    // a choice made on a previous visit following it around the session.
    expect(result.current[0]).toBe('web');
  });

  it('carries a hand-picked frame to a surface that declares nothing', () => {
    // Seeded so the stored fallback is not the frame being picked. Without
    // this the pick is `none`, which is also what a hook that dropped the
    // choice would answer — and the test would pass on a broken one.
    localStorage.setItem(CANVAS_FRAME_KEY, 'web');
    const { result, rerender } = renderAt('/s/finance/account-detail');
    act(() => {
      result.current[1]('none');
    });
    rerender({ at: '/s/finance/import-review' });
    expect(result.current[0]).toBe('none');
  });
});
