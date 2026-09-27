import { ChevronRight } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { TargetHint, useDropTarget } from './drop-target.js';
import { PLACE_ICONS } from './place-icons.js';

import type { ReactElement } from 'react';

import type { LocationModel, PlacementTarget } from '../model/model.js';
import type { RowContext } from './contents-rows.js';

/** Renders a child place as an item destination and navigation row. */
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
}): ReactElement {
  const target: PlacementTarget = { kind: 'location', locationId: node.id };
  const { setNodeRef, state } = useDropTarget(ctx.drag, target);
  const Icon = PLACE_ICONS[node.kind];
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-11 items-center gap-3 border-b px-3 last:border-b-0',
        state === 'over' && 'bg-app-accent/10',
        state === 'refused' && 'cursor-no-drop opacity-60'
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 justify-start px-0 text-left"
        onClick={onOpen}
      >
        <span className="truncate">{node.name}</span>
      </Button>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <TargetHint world={ctx.world} drag={ctx.drag} target={target} />
        <span>{detail}</span>
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </div>
  );
}
