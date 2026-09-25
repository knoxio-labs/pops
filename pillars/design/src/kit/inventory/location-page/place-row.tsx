/**
 * A place inside the current one, as a row: its symbol, name and what it
 * holds, opening it on click. Dropping things on it moves them there.
 */
import { ChevronRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { DROP_TARGET_CLASS } from '../foundation';
import { PLACE_ICONS } from '../locations-tree/fit-page';
import { TargetHint, dropHandlers } from './contents-rows';

import type { LocationModel, PlacementTarget } from '../foundation';
import type { RowContext } from './contents-rows';

/** A sub-place row: open it, or drop things on it. */
export function PlaceRow({
  ctx,
  node,
  detail,
  onOpen,
}: {
  ctx: RowContext;
  node: LocationModel;
  detail: string;
  onOpen: () => void;
}) {
  const target: PlacementTarget = { kind: 'location', locationId: node.id };
  const Icon = PLACE_ICONS[node.kind];
  const state = ctx.drag && ctx.drag.dragging.length > 0 ? ctx.drag.stateFor(target) : 'idle';
  return (
    <div
      role="row"
      {...dropHandlers(ctx.drag, target)}
      className={cn('flex h-11 items-center', DROP_TARGET_CLASS[state])}
    >
      <ButtonPrimitive
        variant="ghost"
        className="h-11 min-w-0 flex-1 justify-start gap-3 rounded-none px-3 font-normal"
        onClick={onOpen}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium">{node.name}</span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
        <span className="ml-auto flex items-center gap-2">
          <TargetHint ctx={ctx} target={target} />
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </ButtonPrimitive>
    </div>
  );
}
