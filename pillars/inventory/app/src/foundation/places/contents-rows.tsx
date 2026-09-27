import { useDraggable } from '@dnd-kit/core';

import { ButtonPrimitive, cn } from '@pops/ui';

import { CodeBadge, ContainerStateBadge } from '../badges/badges.js';
import { ItemMark } from '../badges/item-mark.js';
import { DROP_TARGET_CLASS } from '../drag/drag-dock.js';
import { INVENTORY_ICONS } from '../model/icons.js';
import { samePlacement, targetName } from '../model/placement-model.js';
import { ItemRow, RowVerb } from '../rows/item-row.js';
import { useDropTarget, TargetHint } from './drop-target.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../drag/use-drag-placement.js';
import type { ItemRowModel, PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';

/** Shared row state for direct items, boxed items, and child places. */
export interface RowContext {
  world: PlacementWorld;
  selection?: SelectionApi;
  pendingIds: ReadonlySet<string>;
  rejections: Readonly<Record<string, string>>;
  disabledReason?: string;
  drag?: DragPlacementApi;
  onOpenItem?: (id: string) => void;
  onPickUp?: (id: string) => void;
  onMove?: (id: string) => void;
  onTakeOut?: (id: string) => void;
}

function ContentsRowVerbs({
  itemId,
  inBox,
  ctx,
}: {
  itemId: string;
  inBox: boolean;
  ctx: RowContext;
}): ReactElement {
  return (
    <>
      {inBox ? (
        <RowVerb
          icon={INVENTORY_ICONS.takeOut}
          label="Take out"
          shortcutId="take-out"
          disabledReason={ctx.disabledReason}
          onClick={() => ctx.onTakeOut?.(itemId)}
        />
      ) : null}
      <RowVerb
        icon={INVENTORY_ICONS.pickUp}
        label="Pick up"
        shortcutId="pick-up"
        disabledReason={ctx.disabledReason}
        onClick={() => ctx.onPickUp?.(itemId)}
      />
      <RowVerb
        icon={INVENTORY_ICONS.move}
        label="Move"
        shortcutId="move"
        disabledReason={ctx.disabledReason}
        onClick={() => ctx.onMove?.(itemId)}
      />
    </>
  );
}

/** Renders a draggable item row with its per-item placement verbs. */
export function ContentsItemRow({
  item,
  ctx,
  inBox = false,
}: {
  item: ItemRowModel;
  ctx: RowContext;
  inBox?: boolean;
}): ReactElement {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { kind: 'item', id: item.id, selectedIds: ctx.selection?.selectedIds ?? [] },
    disabled: ctx.drag === undefined || ctx.disabledReason !== undefined,
  });
  const lifted = ctx.drag?.dragging.includes(item.id) === true || isDragging;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(lifted && 'opacity-50')}>
      <ItemRow
        item={item}
        world={ctx.world}
        selectable={ctx.selection !== undefined}
        selected={ctx.selection?.isSelected(item.id) === true}
        focused={ctx.selection?.state.focusedId === item.id}
        pending={ctx.pendingIds.has(item.id)}
        rejection={ctx.rejections[item.id]}
        showPlacement={false}
        onToggle={ctx.selection?.onRowToggle}
        onOpen={ctx.onOpenItem}
        verbs={<ContentsRowVerbs itemId={item.id} inBox={inBox} ctx={ctx} />}
      />
    </div>
  );
}

function things(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'}`;
}

/** Renders a box heading that also accepts dragged item targets. */
export function BoxHeader({
  box,
  count,
  depth,
  ctx,
}: {
  box: ItemRowModel;
  count: number;
  depth: number;
  ctx: RowContext;
}): ReactElement {
  const target: PlacementTarget = { kind: 'container', containerId: box.id };
  const { setNodeRef, state } = useDropTarget(ctx.drag, target);
  return (
    <div
      ref={setNodeRef}
      role="row"
      className={cn(
        'flex h-10 items-center gap-2.5 bg-muted/50 pr-2',
        depth > 0 ? 'pl-9' : 'pl-3',
        DROP_TARGET_CLASS[state]
      )}
    >
      <ItemMark item={box} />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent"
        aria-label={`Open ${box.name}`}
        onClick={() => ctx.onOpenItem?.(box.id)}
      >
        <span className="truncate">{box.name}</span>
      </ButtonPrimitive>
      <ContainerStateBadge container={box.container} />
      <span className="text-xs text-muted-foreground tabular-nums">{things(count)}</span>
      <span className="ml-auto flex items-center gap-2">
        <TargetHint world={ctx.world} drag={ctx.drag} target={target} />
        <CodeBadge code={box.code} />
      </span>
    </div>
  );
}

/** Returns the current target hint when the drag is over this target. */
export function ContentsTargetHint({
  world,
  drag,
  target,
}: {
  world: PlacementWorld;
  drag?: DragPlacementApi;
  target: PlacementTarget;
}): ReactElement | null {
  if (drag === undefined || drag.over === null || !samePlacement(drag.over, target)) return null;
  const verdict = drag.verdictFor(target);
  return verdict.ok ? (
    <span role="status" className="text-xs text-muted-foreground">
      Move {verdict.count} to {targetName(world, target)}
    </span>
  ) : (
    <span role="status" className="text-xs text-muted-foreground">
      {verdict.reason}
    </span>
  );
}
