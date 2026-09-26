/**
 * The split between the facts rail and the tabs: drag to resize the rail,
 * Left and Right arrows to nudge it, double-click or Enter to restore the
 * default width.
 */
import { useRef } from 'react';

import { cn } from '@pops/ui';

import { useEdgeDrag } from '../shared/use-edge-drag';
import { moveRail, RAIL_DEFAULT, RAIL_MAX, RAIL_MIN, RAIL_STEP } from './rail-width';

import type { KeyboardEvent, PointerEvent } from 'react';

/** Props for {@link RailSplitter}. */
export interface RailSplitterProps {
  width: number;
  onWidth: (width: number) => void;
}

/** The draggable gap between rail and tabs. */
export function RailSplitter({ width, onWidth }: RailSplitterProps) {
  const startWidth = useRef(width);
  const drag = useEdgeDrag((deltaX) => onWidth(moveRail(startWidth.current, deltaX)));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startWidth.current = width;
    drag.onPointerDown(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onWidth(moveRail(width, event.key === 'ArrowLeft' ? -RAIL_STEP : RAIL_STEP));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onWidth(RAIL_DEFAULT);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the facts rail. Double-click or Enter restores its width."
      aria-valuenow={width}
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onDoubleClick={() => onWidth(RAIL_DEFAULT)}
      onKeyDown={onKeyDown}
      className="group/split hidden w-5 shrink-0 cursor-col-resize touch-none justify-center outline-none @2xl:flex"
    >
      <span
        aria-hidden
        className={cn(
          'my-6 w-px rounded-full bg-transparent transition-colors group-hover/split:w-0.5 group-hover/split:bg-app-accent group-focus-visible/split:w-0.5 group-focus-visible/split:bg-ring',
          drag.dragging && 'w-0.5 bg-app-accent'
        )}
      />
    </div>
  );
}
