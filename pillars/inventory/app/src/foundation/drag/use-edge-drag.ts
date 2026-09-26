import { useCallback, useEffect, useRef, useState } from 'react';

import type { PointerEvent } from 'react';

interface ActiveDrag {
  id: symbol;
  move: (event: globalThis.PointerEvent) => void;
  end: (event: globalThis.PointerEvent) => void;
  pointerId: number;
  target: HTMLElement;
}

function clampDelta(deltaX: number): number {
  if (Number.isNaN(deltaX)) return 0;
  return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, deltaX));
}

/**
 * Captures a primary pointer on a vertical edge and reports its horizontal
 * movement from the press point until release, cancellation, or unmount.
 */
export function useEdgeDrag(onMove: (deltaX: number) => void): {
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
} {
  const [dragging, setDragging] = useState(false);
  const activeDragRef = useRef<ActiveDrag | null>(null);

  const stop = useCallback(() => {
    const activeDrag = activeDragRef.current;
    if (activeDrag === null) return;

    activeDragRef.current = null;
    activeDrag.target.removeEventListener('pointermove', activeDrag.move);
    activeDrag.target.removeEventListener('pointerup', activeDrag.end);
    activeDrag.target.removeEventListener('pointercancel', activeDrag.end);
    activeDrag.target.releasePointerCapture?.(activeDrag.pointerId);
    setDragging(false);
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        event.type !== 'pointerdown' ||
        event.button !== 0 ||
        !Number.isFinite(event.pointerId) ||
        event.pointerId < 0 ||
        !Number.isFinite(event.clientX) ||
        activeDragRef.current !== null
      ) {
        return;
      }

      event.preventDefault();
      const { clientX: startX, currentTarget: target, pointerId } = event;
      const dragId = Symbol('edge-drag');

      const move = (moveEvent: globalThis.PointerEvent) => {
        if (
          activeDragRef.current?.id !== dragId ||
          moveEvent.pointerId !== pointerId ||
          !Number.isFinite(moveEvent.clientX)
        ) {
          return;
        }

        onMove(clampDelta(moveEvent.clientX - startX));
      };

      const end = (endEvent: globalThis.PointerEvent) => {
        if (activeDragRef.current?.id !== dragId || endEvent.pointerId !== pointerId) {
          return;
        }

        stop();
      };

      activeDragRef.current = { id: dragId, move, end, pointerId, target };
      target.setPointerCapture?.(pointerId);
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', end);
      setDragging(true);
    },
    [onMove, stop]
  );

  return { dragging, onPointerDown };
}
