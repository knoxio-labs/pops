/**
 * What comment mode is pointing at: the box around the element a click would
 * anchor to, or null when the pointer is over the overlay's own chrome or
 * over nothing anchorable.
 *
 * It is the same hit test `usePinning` runs on click, deliberately — an
 * affordance that highlighted something other than what the click pins would
 * be worse than none. The cursor is driven from the same result, so the
 * crosshair appears exactly where a click has an effect.
 */
import { useEffect, useState } from 'react';

import { findTarget } from './anchors';

export interface HoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectOf(el: Element): HoverRect {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
}

export function useHoverTarget(enabled: boolean): HoverRect | null {
  const [rect, setRect] = useState<HoverRect | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRect(null);
      return undefined;
    }
    const onMove = (event: MouseEvent): void => {
      const target = findTarget(document, event.clientX, event.clientY);
      setRect(target ? rectOf(target.el) : null);
    };
    const onLeave = (): void => setRect(null);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !rect) return undefined;
    const root = document.documentElement;
    const previous = root.style.cursor;
    root.style.cursor = 'crosshair';
    return () => {
      root.style.cursor = previous;
    };
  }, [enabled, rect]);

  return rect;
}
