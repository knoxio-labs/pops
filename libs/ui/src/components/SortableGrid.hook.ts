import { useEffect, useRef, useState } from 'react';

import type { DragEvent } from 'react';

type Key = string | number;
interface DragState {
  key: Key;
  original: Key[];
  preview: Key[];
  over: Key | null;
}

function move(keys: Key[], source: Key, target: Key): Key[] {
  const from = keys.indexOf(source);
  const to = keys.indexOf(target);
  if (from < 0 || to < 0 || from === to) return keys;
  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}

function sameKeys(a: Key[], b: Key[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function captureCard(event: DragEvent<HTMLDivElement>): HTMLElement | null {
  if (typeof event.dataTransfer.setDragImage !== 'function') return null;
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const image = card.cloneNode(true);
  if (!(image instanceof HTMLElement)) return null;
  image.removeAttribute('data-sortable-key');
  image.setAttribute('aria-hidden', 'true');
  image.inert = true;
  Object.assign(image.style, {
    position: 'fixed',
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    pointerEvents: 'none',
  });
  card.parentElement?.append(image);
  const x = Number.isFinite(event.clientX) ? event.clientX - bounds.left : 0;
  const y = Number.isFinite(event.clientY) ? event.clientY - bounds.top : 0;
  event.dataTransfer.setDragImage(image, x, y);
  // The browser snapshots after dragstart; keep the visible clone until that snapshot finishes.
  requestAnimationFrame(() => image.remove());
  return image;
}

function useDragState(
  keys: Key[],
  disabled: boolean | undefined,
  onPreview: ((keys: Key[] | null) => void) | undefined
) {
  const active = useRef<DragState | null>(null);
  const image = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<DragState | null>(null);

  useEffect(() => {
    if (active.current && (disabled || !sameKeys(keys, active.current.original))) {
      active.current = null;
      setPreview(null);
      image.current?.remove();
      onPreview?.(null);
    }
  }, [keys, disabled, onPreview]);
  useEffect(() => () => image.current?.remove(), []);

  function update(next: DragState | null) {
    active.current = next;
    setPreview(next);
  }
  function reset() {
    if (!active.current) return;
    update(null);
    image.current?.remove();
    image.current = null;
    onPreview?.(null);
  }
  function capture(event: DragEvent<HTMLDivElement>) {
    image.current?.remove();
    image.current = captureCard(event);
  }
  return { getActive: () => active.current, capture, preview, update, reset };
}

/** Preview through CSS order; changing item keys or disabling sorting cancels the pending drop. */
export function useSortableDrag(
  keys: Key[],
  onReorder: (keys: Key[]) => void,
  disabled?: boolean,
  onPreview?: (keys: Key[] | null) => void
) {
  const { getActive, capture, preview, update, reset } = useDragState(keys, disabled, onPreview);
  const valid = !disabled && preview !== null && sameKeys(keys, preview.original);

  function start(key: Key, event: DragEvent<HTMLDivElement>) {
    if (disabled || event.defaultPrevented) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(key));
    capture(event);
    update({ key, original: keys, preview: keys, over: null });
  }
  function over(key: Key, event: DragEvent<HTMLDivElement>) {
    const drag = getActive();
    if (disabled || !drag || !sameKeys(keys, drag.original)) return;
    event.stopPropagation();
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (key === drag.key) {
      if (drag.over !== null) update({ ...drag, over: null });
      return;
    }
    if (key === drag.over) return;
    const next = { ...drag, preview: move(drag.preview, drag.key, key), over: key };
    update(next);
    onPreview?.(next.preview);
  }
  function drop(key: Key, event: DragEvent<HTMLDivElement>) {
    const drag = getActive();
    if (!drag) return;
    event.stopPropagation();
    event.preventDefault();
    reset();
    if (!disabled && sameKeys(keys, drag.original)) {
      const next = drag.over === null ? move(drag.preview, drag.key, key) : drag.preview;
      if (!sameKeys(keys, next)) onReorder(next);
    }
  }
  function end(event: DragEvent<HTMLDivElement>) {
    event.stopPropagation();
    reset();
  }
  return {
    draggedKey: valid ? preview.key : null,
    order: valid ? preview.preview : keys,
    start,
    over,
    drop,
    end,
  };
}
