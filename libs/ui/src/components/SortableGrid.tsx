import { type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { useSortableDrag } from './SortableGrid.hook';

/** Reorder stable, uniquely keyed items with a full-card native drag image and live preview. */
export interface SortableGridProps<T> {
  items: T[];
  /** Keys must stay stable across reorders and have unique string representations. */
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number, state: { isDragging: boolean }) => ReactNode;
  onReorder: (nextOrder: T[]) => void;
  /** Observe live sorting without committing; null clears the preview after drop or cancellation. */
  onPreviewOrderChange?: (nextOrder: T[] | null) => void;
  /** Tailwind grid classes. Default `grid-cols-3`. */
  columnsClassName?: string;
  disabled?: boolean;
  className?: string;
}

/** Lift the full item, retain a dashed slot, and shift neighbours without committing until drop. */
export function SortableGrid<T>({
  items,
  getKey,
  renderItem,
  onReorder,
  onPreviewOrderChange,
  columnsClassName = 'grid-cols-3',
  disabled,
  className,
}: SortableGridProps<T>) {
  const keys = items.map(getKey);
  if (new Set(keys.map(String)).size !== keys.length) {
    throw new Error('SortableGrid requires unique item keys.');
  }
  function resolveOrder(next: Array<string | number>) {
    return next.flatMap((key) => items.filter((item, index) => getKey(item, index) === key));
  }
  const drag = useSortableDrag(
    keys,
    (next) => onReorder(resolveOrder(next)),
    disabled,
    (next) => onPreviewOrderChange?.(next === null ? null : resolveOrder(next))
  );
  return (
    <div className={cn('grid gap-3', columnsClassName, className)}>
      {items.map((item, index) => {
        const key = getKey(item, index);
        const isDragging = drag.draggedKey === key;
        return (
          <div
            key={key}
            draggable={!disabled}
            data-sortable-key={key}
            data-sortable-placeholder={isDragging || undefined}
            style={{ order: drag.order.indexOf(key) }}
            onDragStart={(event) => drag.start(key, event)}
            onDragOver={(event) => drag.over(key, event)}
            onDrop={(event) => drag.drop(key, event)}
            onDragEnd={drag.end}
            className={cn(
              'rounded-xl border border-transparent transition-colors',
              isDragging && 'border-dashed border-app-accent bg-muted/30'
            )}
          >
            <div className={cn(isDragging && 'invisible pointer-events-none')}>
              {renderItem(item, index, { isDragging })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
