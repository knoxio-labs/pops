import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useHoverTarget } from './use-hover-target';

function stubHit(el: Element | null): void {
  document.elementsFromPoint = () => (el ? [el] : []);
}

function paint(el: Element, rect: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }) as DOMRect;
}

function move(): void {
  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5, bubbles: true }));
  });
}

afterEach(() => {
  // The pillar's vitest config sets no `globals`, so RTL registers no
  // automatic cleanup: without this, a hook from an earlier test stays
  // mounted and keeps answering mousemove.
  cleanup();
  document.body.innerHTML = '';
  document.documentElement.style.cursor = '';
});

describe('useHoverTarget', () => {
  it('reports the box of the element a click would anchor to', () => {
    document.body.innerHTML = '<div id="row">row</div>';
    const row = document.querySelector('#row')!;
    paint(row, { left: 10, top: 20, width: 100, height: 30 });
    stubHit(row);

    const { result } = renderHook(() => useHoverTarget(true));
    move();

    expect(result.current).toEqual({ left: 10, top: 20, width: 100, height: 30 });
  });

  it('reports nothing while comment mode is off', () => {
    document.body.innerHTML = '<div id="row">row</div>';
    const row = document.querySelector('#row')!;
    paint(row, { left: 10, top: 20, width: 100, height: 30 });
    stubHit(row);

    const { result } = renderHook(() => useHoverTarget(false));
    move();

    expect(result.current).toBeNull();
  });

  /**
   * The pointer over the panel pins nothing, so it must not claim otherwise.
   */
  it('reports nothing over the overlay’s own chrome', () => {
    document.body.innerHTML = '<div data-pops-design-overlay><button id="x">x</button></div>';
    stubHit(document.querySelector('#x'));

    const { result } = renderHook(() => useHoverTarget(true));
    move();

    expect(result.current).toBeNull();
  });

  it('shows the crosshair only while something is under the pointer', () => {
    document.body.innerHTML = '<div id="row">row</div>';
    const row = document.querySelector('#row')!;
    paint(row, { left: 0, top: 0, width: 10, height: 10 });
    stubHit(row);

    renderHook(() => useHoverTarget(true));
    move();
    expect(document.documentElement.style.cursor).toBe('crosshair');

    stubHit(null);
    move();
    expect(document.documentElement.style.cursor).toBe('');
  });

  it('restores the cursor when comment mode is turned off', () => {
    document.body.innerHTML = '<div id="row">row</div>';
    const row = document.querySelector('#row')!;
    paint(row, { left: 0, top: 0, width: 10, height: 10 });
    stubHit(row);

    const { rerender } = renderHook(({ on }: { on: boolean }) => useHoverTarget(on), {
      initialProps: { on: true },
    });
    move();
    expect(document.documentElement.style.cursor).toBe('crosshair');

    rerender({ on: false });
    expect(document.documentElement.style.cursor).toBe('');
  });
});
