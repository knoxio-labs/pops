/** Resizable item-table columns with pointer, keyboard, and fit-to-content controls. */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { cn } from '@pops/ui';

import { useEdgeDrag } from '../drag/use-edge-drag';
import {
  clampWidth,
  COLUMN_LIMITS,
  columnStyle,
  dragWidth,
  fitWidth,
  nudgeWidth,
} from './column-widths';
import { COLUMN } from './table-columns';

import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode, RefObject } from 'react';

import type { ColumnId, ColumnWidths } from './column-widths';

const ColumnWidthsContext = createContext<ColumnWidths>({});

/** Provides one table's explicitly set column widths to its cells. */
export function ColumnWidthsProvider(props: {
  widths: ColumnWidths;
  children: ReactNode;
}): ReactElement {
  return (
    <ColumnWidthsContext.Provider value={props.widths}>
      {props.children}
    </ColumnWidthsContext.Provider>
  );
}

/** Returns the explicitly set width for a column, if it has one. */
export function useColumnWidth(id: ColumnId): number | undefined {
  return useContext(ColumnWidthsContext)[id];
}

/** Returns the default or explicitly sized classes for a column. */
export function useColumnClass(id: ColumnId): string {
  const { base, sized } = COLUMN[id];
  return useColumnWidth(id) === undefined ? base : sized;
}

function measureColumn(table: HTMLElement, id: ColumnId): number[] {
  const cells = [...table.querySelectorAll<HTMLElement>(`[data-col="${id}"]`)];
  const saved = cells.map((cell) => [cell.style.width, cell.style.flex] as const);
  for (const cell of cells) {
    cell.style.width = 'max-content';
    cell.style.flex = 'none';
  }
  const widths = cells.map((cell) => cell.getBoundingClientRect().width);
  cells.forEach((cell, index) => {
    const [width, flex] = saved[index] ?? ['', ''];
    cell.style.width = width;
    cell.style.flex = flex;
  });
  return widths;
}

function currentWidth(table: HTMLElement, id: ColumnId): number {
  return table.querySelector<HTMLElement>(`[role="row"] [data-col="${id}"]`)?.offsetWidth ?? 0;
}

/** The state and actions shared by one table's column resize handles. */
export interface ColumnWidthsApi {
  widths: ColumnWidths;
  style: Record<string, string>;
  resize: (id: ColumnId, width: number) => void;
  fit: (id: ColumnId) => void;
  widthOf: (id: ColumnId) => number;
}

/** Owns unpersisted column widths for one mounted table. */
export function useColumnWidths(tableRef: RefObject<HTMLElement | null>): ColumnWidthsApi {
  const [widths, setWidths] = useState<ColumnWidths>({});
  const resize = useCallback((id: ColumnId, width: number) => {
    setWidths((previous) => ({ ...previous, [id]: clampWidth(id, width) }));
  }, []);
  const fit = useCallback(
    (id: ColumnId) => {
      const table = tableRef.current;
      if (table === null) return;
      resize(id, fitWidth(id, measureColumn(table, id)));
    },
    [tableRef, resize]
  );
  const widthOf = useCallback(
    (id: ColumnId) => {
      const table = tableRef.current;
      return table === null ? 0 : currentWidth(table, id);
    },
    [tableRef]
  );
  const style = useMemo(() => columnStyle(widths), [widths]);
  return { widths, style, resize, fit, widthOf };
}

/** A header grip that resizes or fits one table column. */
export function ColumnResizeHandle(props: {
  id: ColumnId;
  label: string;
  api: ColumnWidthsApi;
}): ReactElement {
  const width = props.api.widths[props.id];
  const startWidth = useRef(0);
  const drag = useEdgeDrag((deltaX) =>
    props.api.resize(props.id, dragWidth(props.id, startWidth.current, deltaX))
  );
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startWidth.current = props.api.widthOf(props.id);
    drag.onPointerDown(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      props.api.resize(
        props.id,
        nudgeWidth(props.id, width ?? props.api.widthOf(props.id), direction)
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      props.api.fit(props.id);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${props.label}. Double-click or Enter fits the widest value.`}
      aria-valuenow={width ?? props.api.widthOf(props.id)}
      aria-valuemin={COLUMN_LIMITS[props.id].min}
      aria-valuemax={COLUMN_LIMITS[props.id].max}
      tabIndex={0}
      title="Drag to resize. Double-click to fit."
      onPointerDown={onPointerDown}
      onDoubleClick={() => props.api.fit(props.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'group/grip absolute inset-y-0 -right-2 z-10 flex w-4 cursor-col-resize touch-none justify-center outline-none'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'my-2 w-px rounded-full bg-border transition-colors group-hover/grip:w-0.5 group-hover/grip:bg-app-accent group-focus-visible/grip:w-0.5 group-focus-visible/grip:bg-app-accent',
          drag.dragging && 'w-0.5 bg-app-accent'
        )}
      />
    </div>
  );
}
