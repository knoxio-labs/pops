import { useEffect, useState, type RefObject } from 'react';

import type { FrameToShell } from './viewport';

export interface Avail {
  w: number;
  h: number;
}

/** The canvas area a sized frame may occupy, minus room for the handles and the size label. */
export function useAvail(ref: RefObject<HTMLDivElement | null>): Avail | null {
  const [avail, setAvail] = useState<Avail | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setAvail({ w: Math.max(el.clientWidth - 48, 200), h: Math.max(el.clientHeight - 64, 200) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return avail;
}

/**
 * Messages from this frame only: same origin, and the sender must be the
 * iframe's own window, so a stray message from anywhere else is ignored.
 */
export function useFrameMessages(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  onMessage: (message: FrameToShell) => void
): void {
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      onMessage(event.data as FrameToShell);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [iframeRef, onMessage]);
}

/**
 * Corner-drag resizing: the frame grows symmetrically around the canvas
 * centre, and the shell receives the size in the frame's own CSS pixels
 * (undoing the fit-to-canvas scale).
 */
export function useCornerDrag(
  containerRef: RefObject<HTMLDivElement | null>,
  scale: number,
  onResize: (w: number, h: number) => void
): { dragging: boolean; startDrag: (event: React.PointerEvent) => void } {
  const [dragging, setDragging] = useState(false);
  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    setDragging(true);
    const rect = container.getBoundingClientRect();
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const onMove = (move: PointerEvent) => {
      const w = Math.max(240, Math.round(Math.abs(move.clientX - centre.x) * 2) / scale);
      const h = Math.max(240, Math.round(Math.abs(move.clientY - centre.y) * 2) / scale);
      onResize(Math.round(w), Math.round(h));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return { dragging, startDrag };
}
