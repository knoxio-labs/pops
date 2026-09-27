import { useDroppable } from '@dnd-kit/core';

import { DROP_TARGET_CLASS, DropHint } from '../drag/drag-dock.js';
import { samePlacement, targetName } from '../model/placement-model.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi, DropTargetState } from '../drag/use-drag-placement.js';
import type { PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

function targetKey(target: PlacementTarget): string {
  if (target.kind === 'in-hand') return 'target:in-hand';
  return `target:${target.kind}:${target.kind === 'location' ? target.locationId : target.containerId}`;
}

function targetState(active: boolean, isOver: boolean, allowed: boolean): DropTargetState {
  if (!active) return 'idle';
  if (!allowed) return 'refused';
  return isOver ? 'over' : 'available';
}

/** Registers one placement target with dnd-kit and maps its verdict to a visual state. */
export function useDropTarget(
  drag: DragPlacementApi | undefined,
  target: PlacementTarget
): { setNodeRef: (node: HTMLElement | null) => void; state: DropTargetState } {
  const droppable = useDroppable({ id: targetKey(target), data: { kind: 'target', target } });
  const active = drag !== undefined && drag.dragging.length > 0;
  const verdict = active ? drag.verdictFor(target) : null;
  const state = targetState(active, droppable.isOver, verdict?.ok === true);
  return { setNodeRef: droppable.setNodeRef, state };
}

/** Renders the move verdict for a target currently under the dragged selection. */
export function TargetHint({
  world,
  drag,
  target,
}: {
  world: PlacementWorld;
  drag: DragPlacementApi | undefined;
  target: PlacementTarget;
}): ReactElement | null {
  if (drag === undefined || drag.over === null || !samePlacement(drag.over, target)) return null;
  const verdict = drag.verdictFor(target);
  return verdict.ok ? (
    <DropHint verdict={{ ok: true, count: verdict.count, targetName: targetName(world, target) }} />
  ) : (
    <DropHint verdict={verdict} />
  );
}

/** Exposes the target class for callers that render a custom target surface. */
export function dropTargetClass(state: DropTargetState): string {
  return DROP_TARGET_CLASS[state];
}
