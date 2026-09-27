import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useState } from 'react';

import { DragGhost } from '../drag/drag-dock.js';
import { InHandStrip } from './in-hand-strip.js';

import type { ReactElement, ReactNode } from 'react';

import type { DragPlacementApi } from '../drag/use-drag-placement.js';
import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

interface PlaceDragController {
  readonly begin: (placeId: string) => void;
  readonly hover: (targetId: string, position: 'before' | 'after' | 'inside') => void;
  readonly drop: () => void;
  readonly cancel: () => void;
}

/** Payload placed on draggable place and item rows. */
export type PlaceDragPayload =
  | { kind: 'item'; id: string; selectedIds: readonly string[] }
  | { kind: 'place'; id: string };

/** Payload placed on a droppable location or container target. */
export interface PlacementDropPayload {
  kind: 'target';
  target: PlacementTarget;
}

/** Props for the shared locations drag context. */
export interface PlacesDndProps {
  world: PlacementWorld;
  itemDrag?: DragPlacementApi;
  placeDrag?: PlaceDragController;
  children: ReactNode;
}

function payload(value: Record<string, unknown> | undefined): PlaceDragPayload | null {
  if (value?.kind === 'place' && typeof value.id === 'string') {
    return { kind: 'place', id: value.id };
  }
  if (value?.kind !== 'item' || typeof value.id !== 'string') return null;
  const selectedIds = value.selectedIds;
  if (
    !Array.isArray(selectedIds) ||
    !selectedIds.every((id): id is string => typeof id === 'string')
  ) {
    return null;
  }
  return { kind: 'item', id: value.id, selectedIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fixedTarget(value: Record<string, unknown>): PlacementTarget | null {
  if (value.kind === 'in-hand') return { kind: 'in-hand' };
  if (value.kind === 'location' && typeof value.locationId === 'string') {
    return { kind: 'location', locationId: value.locationId };
  }
  if (value.kind === 'container' && typeof value.containerId === 'string') {
    return { kind: 'container', containerId: value.containerId };
  }
  return null;
}

function target(value: Record<string, unknown> | undefined): PlacementTarget | null {
  if (value?.kind !== 'target' || !isRecord(value.target)) return null;
  return fixedTarget(value.target);
}

function position(event: DragOverEvent): 'before' | 'after' | 'inside' {
  const over = event.over;
  if (over === null) return 'inside';
  const activeRect = event.active.rect.current.translated;
  const offset =
    activeRect === null
      ? over.rect.height / 2
      : activeRect.top + activeRect.height / 2 - over.rect.top;
  if (over.rect.height <= 0) return 'inside';
  const ratio = offset / over.rect.height;
  if (ratio < 0.25) return 'before';
  return ratio > 0.75 ? 'after' : 'inside';
}

function dragName(world: PlacementWorld, active: PlaceDragPayload): string {
  if (active.kind === 'place') return world.locations.get(active.id)?.name ?? 'place';
  return world.items.get(active.id)?.name ?? 'item';
}

interface DndHandlerOptions {
  itemDrag?: DragPlacementApi;
  placeDrag?: PlaceDragController;
  setActive: (active: PlaceDragPayload | null) => void;
}

function finishDrag({
  current,
  destination,
  itemDrag,
  placeDrag,
  setActive,
}: {
  current: PlaceDragPayload | null;
  destination: PlacementTarget | null;
  itemDrag?: DragPlacementApi;
  placeDrag?: PlaceDragController;
  setActive: (active: PlaceDragPayload | null) => void;
}): void {
  if (current?.kind === 'item') {
    if (destination !== null) itemDrag?.drop(destination);
    else itemDrag?.cancel();
  } else if (current?.kind === 'place') {
    if (destination?.kind === 'location') placeDrag?.drop();
    else placeDrag?.cancel();
  }
  setActive(null);
}

function useDndHandlers({ itemDrag, placeDrag, setActive }: DndHandlerOptions) {
  const onDragStart = useCallback(
    (event: DragStartEvent): void => {
      const current = payload(event.active.data.current);
      setActive(current);
      if (current?.kind === 'item') itemDrag?.begin(current.id, current.selectedIds);
      if (current?.kind === 'place') placeDrag?.begin(current.id);
    },
    [itemDrag, placeDrag, setActive]
  );

  const onDragOver = useCallback(
    (event: DragOverEvent): void => {
      const current = payload(event.active.data.current);
      const destination = target(event.over?.data.current);
      if (current?.kind === 'item') {
        itemDrag?.hover(destination);
        return;
      }
      if (current?.kind !== 'place' || event.over === null) return;
      const destinationId = destination?.kind === 'location' ? destination.locationId : null;
      if (destinationId !== null) placeDrag?.hover(destinationId, position(event));
    },
    [itemDrag, placeDrag]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent): void => {
      finishDrag({
        current: payload(event.active.data.current),
        destination: target(event.over?.data.current),
        itemDrag,
        placeDrag,
        setActive,
      });
    },
    [itemDrag, placeDrag, setActive]
  );

  const onDragCancel = useCallback((): void => {
    itemDrag?.cancel();
    placeDrag?.cancel();
    setActive(null);
  }, [itemDrag, placeDrag, setActive]);

  return { onDragStart, onDragOver, onDragEnd, onDragCancel };
}

/** Provides one pointer-only dnd-kit context for items and places. */
export function PlacesDnd({ world, itemDrag, placeDrag, children }: PlacesDndProps): ReactElement {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [active, setActive] = useState<PlaceDragPayload | null>(null);
  const handlers = useDndHandlers({ itemDrag, placeDrag, setActive });

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handlers.onDragStart}
      onDragOver={handlers.onDragOver}
      onDragEnd={handlers.onDragEnd}
      onDragCancel={handlers.onDragCancel}
    >
      {children}
      {itemDrag?.dragging.length ? (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl">
          <InHandStrip drag={itemDrag} />
        </div>
      ) : null}
      <DragOverlay>
        {active === null ? null : (
          <DragGhost
            name={dragName(world, active)}
            count={active.kind === 'item' ? active.selectedIds.length : 1}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
