import { Ban, CornerDownRight } from 'lucide-react';

import { cn } from '@pops/ui';

import { DROP_TARGET_CLASS, DropHint } from '../../foundation/drag/drag-dock.js';
import { targetName } from '../../foundation/model/placement-model.js';
import {
  dropPlaceVerdict,
  subtreeIds,
  type DropPosition,
  type PlaceVerdict,
} from '../../foundation/places/tree-model.js';

import type { ReactNode } from 'react';

import type {
  DragPlacementApi,
  DropTargetState,
} from '../../foundation/drag/use-drag-placement.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceDragApi } from './use-place-drag.js';

/** Both active drag channels used by one Locations page. */
export interface TreeDrag {
  world: PlacementWorld;
  placeDrag: PlaceDragApi;
  itemDrag?: DragPlacementApi;
}

/** The visual state of a tree row while either drag channel is active. */
export interface RowDropState {
  state: DropTargetState;
  position?: DropPosition;
}

function placeHint(world: PlacementWorld, drag: PlaceDragApi): ReactNode {
  if (drag.state === null) return null;
  const name = world.locations.get(drag.state.placeId)?.name ?? 'this place';
  if (drag.state.targetId === null) {
    return <PlaceHint ok text={`Moving ${name}. Drop on a place.`} />;
  }
  const target = world.locations.get(drag.state.targetId);
  if (target === undefined) return <PlaceHint ok={false} text="That place no longer exists." />;
  const verdict = drag.verdict();
  if (verdict === null) return null;
  if (!verdict.ok) return <PlaceHint ok={false} text={verdict.reason} />;
  const position = drag.state.position === 'inside' ? 'inside' : drag.state.position;
  return <PlaceHint ok text={`Put ${name} ${position} ${target.name}`} />;
}

function PlaceHint({ ok, text }: { ok: boolean; text: string }): ReactNode {
  const Icon = ok ? CornerDownRight : Ban;
  return (
    <span
      role="status"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-xs text-foreground"
    >
      <Icon
        className={cn(ok ? 'size-3.5 text-app-accent' : 'size-3.5 text-muted-foreground')}
        aria-hidden
      />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** Computes the row state for a place drag or an item drag. */
export function rowDropState(drag: TreeDrag, id: string): RowDropState | undefined {
  const place = drag.placeDrag.state;
  if (place !== null) {
    if (place.targetId !== id) return { state: 'idle' };
    const verdict = dropPlaceVerdict(drag.world, place.placeId, id, place.position);
    return verdict.ok
      ? { state: 'over', position: place.position }
      : { state: 'refused', position: place.position };
  }
  if (drag.itemDrag === undefined || drag.itemDrag.dragging.length === 0) return undefined;
  const target: PlacementTarget = { kind: 'location', locationId: id };
  return { state: drag.itemDrag.stateFor(target) };
}

/** Returns the footer hint for the active tree drag, if any. */
export function treeDragHint(drag: TreeDrag): ReactNode {
  const place = placeHint(drag.world, drag.placeDrag);
  if (place !== null) return place;
  if (
    drag.itemDrag === undefined ||
    drag.itemDrag.dragging.length === 0 ||
    drag.itemDrag.over === null
  ) {
    return null;
  }
  const verdict = drag.itemDrag.verdictFor(drag.itemDrag.over);
  return verdict.ok ? (
    <DropHint
      verdict={{
        ok: true,
        count: verdict.count,
        targetName: targetName(drag.world, drag.itemDrag.over),
      }}
    />
  ) : (
    <DropHint verdict={verdict} />
  );
}

/** Returns whether a tree row is inside the place currently being dragged. */
export function isLifted(drag: TreeDrag, id: string): boolean {
  const state = drag.placeDrag.state;
  return state !== null && subtreeIds(drag.world, state.placeId).includes(id);
}

/** Exposes the shared target class for a tree row's custom wrapper. */
export function rowDropClass(state: RowDropState | undefined): string {
  return state === undefined ? '' : DROP_TARGET_CLASS[state.state];
}

/** Returns the verdict for an explicit place row target. */
export function placeRowVerdict(
  world: PlacementWorld,
  placeId: string,
  targetId: string,
  position: DropPosition
): PlaceVerdict {
  return dropPlaceVerdict(world, placeId, targetId, position);
}
