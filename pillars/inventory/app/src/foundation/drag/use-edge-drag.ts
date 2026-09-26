import { useRef, useState } from 'react';

import type { PointerEvent } from 'react';

/**
 * Captures a primary pointer on an edge and reports horizontal movement from
 * the press point until the pointer is released or cancelled.
 */
export function useEdgeDrag(onMove: (deltaX: number) => void): {
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
} {
  const [dragging, setDragging] = useState(false);
  const activePointerId = useRef<number | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || activePointerId.current !== null) return;

    event.preventDefault();
    const startX = event.clientX;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    activePointerId.current = pointerId;
    target.setPointerCapture(pointerId);
    setDragging(true);

    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      onMove(moveEvent.clientX - startX);
    };
    const end = (endEvent: globalThis.PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;

      activePointerId.current = null;
      setDragging(false);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  return { dragging, onPointerDown };
}
