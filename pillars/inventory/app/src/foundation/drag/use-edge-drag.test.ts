import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useEdgeDrag } from './use-edge-drag';

interface HarnessProps {
  onMove: (deltaX: number) => void;
}

function Harness({ onMove }: HarnessProps) {
  const { dragging, onPointerDown } = useEdgeDrag(onMove);

  return createElement('div', {
    'data-dragging': dragging,
    onPointerDown,
    role: 'separator',
    tabIndex: 0,
  });
}

function setup(onMove: (deltaX: number) => void = vi.fn()) {
  const view = render(createElement(Harness, { onMove }));
  const target = view.container.firstElementChild;
  if (!(target instanceof HTMLElement)) throw new Error('drag target was not rendered');

  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  target.setPointerCapture = setPointerCapture;
  target.releasePointerCapture = releasePointerCapture;

  return { releasePointerCapture, setPointerCapture, target, view };
}

function press(target: HTMLElement, pointerId = 7, clientX = 100): void {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX,
    pointerId,
    pointerType: 'mouse',
  });
}

describe('useEdgeDrag', () => {
  it('reports movement relative to the press point and captures the pointer', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { setPointerCapture, target } = setup(onMove);

    press(target);
    fireEvent.pointerMove(target, { clientX: 135, pointerId: 7 });
    fireEvent.pointerMove(target, { clientX: 80, pointerId: 7 });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(onMove.mock.calls.map(([deltaX]) => deltaX)).toEqual([35, -20]);
  });

  it('ignores non-primary and non-pointer input', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { setPointerCapture, target } = setup(onMove);

    fireEvent.pointerDown(target, {
      button: 2,
      clientX: 100,
      pointerId: 7,
      pointerType: 'mouse',
    });
    fireEvent.mouseDown(target, { button: 0, clientX: 100 });
    fireEvent.keyDown(target, { key: 'ArrowRight' });

    expect(target).toHaveAttribute('data-dragging', 'false');
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('clamps oversized movement to safe deltas', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { target } = setup(onMove);

    press(target, 7, 0);
    fireEvent.pointerMove(target, { clientX: Number.MAX_VALUE, pointerId: 7 });
    fireEvent.pointerMove(target, { clientX: -Number.MAX_VALUE, pointerId: 7 });

    expect(onMove.mock.calls.map(([deltaX]) => deltaX)).toEqual([
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
    ]);
  });

  it('stops reporting after pointerup and releases the pointer', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { releasePointerCapture, target } = setup(onMove);

    press(target);
    fireEvent.pointerUp(target, { pointerId: 7 });
    fireEvent.pointerMove(target, { clientX: 135, pointerId: 7 });

    expect(target).toHaveAttribute('data-dragging', 'false');
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('stops reporting after pointercancel and releases the pointer', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { releasePointerCapture, target } = setup(onMove);

    press(target);
    fireEvent.pointerCancel(target, { pointerId: 7 });
    fireEvent.pointerMove(target, { clientX: 135, pointerId: 7 });

    expect(target).toHaveAttribute('data-dragging', 'false');
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('is dragging only between press and release', () => {
    const { target } = setup();

    expect(target).toHaveAttribute('data-dragging', 'false');
    press(target);
    expect(target).toHaveAttribute('data-dragging', 'true');
    fireEvent.pointerUp(target, { pointerId: 7 });
    expect(target).toHaveAttribute('data-dragging', 'false');
  });

  it('cleans up listeners and pointer capture when unmounted during a drag', () => {
    const onMove = vi.fn<(deltaX: number) => void>();
    const { releasePointerCapture, target, view } = setup(onMove);

    press(target);
    view.unmount();
    fireEvent.pointerMove(target, { clientX: 135, pointerId: 7 });

    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).not.toHaveBeenCalled();
  });
});
