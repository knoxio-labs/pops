/**
 * How a tree row answers whatever is being dragged over it: items (the
 * move plan's verdict) or another place (the tree model's verdict), turned
 * into the row's drop state and the one line the tree footer shows.
 */
import { Ban, CornerDownRight } from 'lucide-react';

import { DropHint, targetName } from '../foundation';
import { dropPlaceVerdict, subtreeIds } from './tree-model';
import { positionFromPointer } from './use-place-drag';

import type { DragEvent, ReactNode } from 'react';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { RowDropState, TreeRowProps } from './tree-row';
import type { LocationsApi } from './use-locations';

function PlaceHint({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CornerDownRight : Ban;
  return (
    <span
      role="status"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-xs text-foreground"
    >
      <Icon
        className={ok ? 'size-3.5 text-app-accent' : 'size-3.5 text-muted-foreground'}
        aria-hidden
      />
      <span className="truncate">{text}</span>
    </span>
  );
}

function placeDropState(api: LocationsApi, id: string): RowDropState | undefined {
  const drag = api.placeDrag.state;
  if (drag === null) return undefined;
  if (drag.targetId !== id) return { state: 'idle' };
  const verdict = dropPlaceVerdict(api.world, drag.placeId, id, drag.position);
  if (!verdict.ok) return { state: 'refused' };
  return { state: 'over', position: drag.position };
}

function itemDropState(api: LocationsApi, id: string): RowDropState | undefined {
  const drag = api.itemDrag;
  if (drag.dragging.length === 0) return undefined;
  return { state: drag.stateFor({ kind: 'location', locationId: id }) };
}

/** The drop state a row draws, or undefined when nothing is being dragged. */
export function rowDropState(api: LocationsApi, id: string): RowDropState | undefined {
  return placeDropState(api, id) ?? itemDropState(api, id);
}

function placeHint(api: LocationsApi): ReactNode {
  const drag = api.placeDrag.state;
  if (drag === null) return null;
  const moving = api.world.locations.get(drag.placeId)?.name ?? 'Place';
  if (drag.targetId === null) return <PlaceHint ok text={`Moving ${moving}. Drop on a place.`} />;
  const verdict = dropPlaceVerdict(api.world, drag.placeId, drag.targetId, drag.position);
  if (!verdict.ok) return <PlaceHint ok={false} text={verdict.reason} />;
  const target = api.world.locations.get(drag.targetId)?.name ?? 'here';
  const text =
    drag.position === 'inside'
      ? `Put ${moving} inside ${target}`
      : `Put ${moving} ${drag.position} ${target}`;
  return <PlaceHint ok text={text} />;
}

/** The one line the tree's footer shows while anything is dragged over it. */
export function treeDragHint(api: LocationsApi): ReactNode {
  const place = placeHint(api);
  if (place !== null) return place;
  const drag = api.itemDrag;
  if (drag.dragging.length === 0 || drag.over === null) return null;
  const verdict = drag.verdictFor(drag.over);
  return verdict.ok ? (
    <DropHint
      verdict={{ ok: true, count: verdict.count, targetName: targetName(api.world, drag.over) }}
    />
  ) : (
    <DropHint verdict={verdict} />
  );
}

/** Whether the row is inside the place being dragged, so it lifts with it. */
export function isLifted(world: PlacementWorld, api: LocationsApi, id: string): boolean {
  const drag = api.placeDrag.state;
  return drag !== null && subtreeIds(world, drag.placeId).includes(id);
}

/** Native drag handlers for one row, routing to whichever drag is live. */
export function rowDragHandlers(api: LocationsApi, id: string): TreeRowProps['dragHandlers'] {
  const target: PlacementTarget = { kind: 'location', locationId: id };
  return {
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      api.placeDrag.begin(id);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const drag = api.placeDrag.state;
      if (drag !== null) {
        const box = event.currentTarget.getBoundingClientRect();
        const position = positionFromPointer(event.clientY - box.top, box.height);
        api.placeDrag.hover(id, position);
        if (dropPlaceVerdict(api.world, drag.placeId, id, position).ok) event.preventDefault();
        return;
      }
      if (api.itemDrag.dragging.length === 0) return;
      api.itemDrag.hover(target);
      if (api.itemDrag.verdictFor(target).ok) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (api.placeDrag.state !== null) api.placeDrag.drop();
      else api.itemDrag.drop(target);
    },
    onDragEnd: () => {
      api.placeDrag.cancel();
      api.itemDrag.cancel();
    },
  };
}
