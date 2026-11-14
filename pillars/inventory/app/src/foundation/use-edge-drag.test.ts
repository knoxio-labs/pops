import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useEdgeDrag } from './use-edge-drag';

import type { PointerEvent } from 'react';

interface HarnessProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPrevented: (prevented: boolean) => void;
}

function Harness({ onPointerDown, onPrevented }: HarnessProps) {
  return createElement('div', {
    onPointerDown: (event) => {
      onPointerDown(event);
      onPrevented(event.defaultPrevented);
    },
  });
}

function setup(onMove: (deltaX: number) => void = vi.fn()) {
  const hook = renderHook(() => useEdgeDrag(onMove));
  const onPrevented = vi.fn<(prevented: boolean) => void>();
  const view = render(
    createElement(Harness, {
      onPointerDown: hook.result.current.onPointerDown,
      onPrevented,
    })
  );
  const target = view.container.firstElementChild;
  if (!(target instanceof HTMLElement)) throw new Error('drag target was not rendered');

  const setPointerCapture = vi.fn<(pointerId: number) => void>();
  target.setPointerCapture = setPointerCapture;
  const removeEventListener = vi.spyOn(target, 'removeEventListener');

  return { hook, onPrevented, removeEventListener, setPointerCapture, target, view };
}

function press(target: HTMLElement, pointerId = 7, clientX = 100, button = 0): void {
  act(() => {
    fireEvent.pointerDown(target, {
      button,
      clientX,
      pointerId,
      pointerType: 'mouse',
    });
  });
}

function move(target: HTMLElement, pointerId: number, clientX: number): void {
  act(() => {
    fireEvent.pointerMove(target, { clientX, pointerId });
  });
}

function end(target: HTMLElement, kind: 'pointerCancel' | 'pointerUp', pointerId: number): void {
  act(() => {
    fireEvent[kind](target, { pointerId });
  });
}

describe('useEdgeDrag', () => {
  it('reports movement relative to the press point', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { onPrevented, setPointerCapture, target } = setup(onMove);

    press(target, 7, 100);
    move(target, 7, 135);
    move(target, 7, 80);

    expect(onMove.mock.calls.map(([deltaX]) => deltaX)).toEqual([35, -20]);
    expect(onPrevented).toHaveBeenCalledWith(true);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('ignores a non-primary button', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { hook, onPrevented, setPointerCapture, target } = setup(onMove);

    press(target, 7, 100, 2);
    move(target, 7, 135);

    expect(hook.result.current.dragging).toBe(false);
    expect(onPrevented).toHaveBeenCalledWith(false);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('stops reporting after pointerup', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { hook, removeEventListener, target } = setup(onMove);

    press(target);
    move(target, 7, 135);
    end(target, 'pointerUp', 7);
    move(target, 7, 80);

    expect(hook.result.current.dragging).toBe(false);
    expect(onMove.mock.calls.map(([deltaX]) => deltaX)).toEqual([35]);
    expect(removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });

  it('stops reporting after pointercancel', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { hook, removeEventListener, target } = setup(onMove);

    press(target);
    move(target, 7, 135);
    end(target, 'pointerCancel', 7);
    move(target, 7, 80);

    expect(hook.result.current.dragging).toBe(false);
    expect(onMove.mock.calls.map(([deltaX]) => deltaX)).toEqual([35]);
    expect(removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });

  it('is dragging only between press and release', () => {
    const { hook, target } = setup();

    expect(hook.result.current.dragging).toBe(false);
    press(target);
    expect(hook.result.current.dragging).toBe(true);
    end(target, 'pointerUp', 7);
    expect(hook.result.current.dragging).toBe(false);
  });
});
