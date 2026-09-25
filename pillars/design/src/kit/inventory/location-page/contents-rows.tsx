/**
 * The rows a place's contents are drawn with, shared by the location page
 * and the Locations panel: item rows that can be selected and dragged, the
 * header each box's contents sit under (itself a drop target). Every row has a keyboard path through its verbs; the
 * drag is a shortcut, never the only way.
 */
import { ButtonPrimitive, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  DROP_TARGET_CLASS,
  DropHint,
  INVENTORY_ICONS,
  ItemMark,
  ItemRow,
  RowVerb,
  samePlacement,
  targetName,
} from '../foundation';

import type { DragEvent } from 'react';

import type {
  DragPlacementApi,
  ItemRowModel,
  PlacementTarget,
  PlacementWorld,
  SelectionApi,
} from '../foundation';

/** What every contents row reads and calls. */
export interface RowContext {
  world: PlacementWorld;
  selection?: SelectionApi;
  drag?: DragPlacementApi;
  onOpenItem?: (id: string) => void;
  onPickUp?: (id: string) => void;
  onMove?: (id: string) => void;
  onTakeOut?: (id: string) => void;
}

/** Native drop handlers that route a hover and a drop to `drag` for one target. */
export function dropHandlers(drag: DragPlacementApi | undefined, target: PlacementTarget) {
  if (drag === undefined) return {};
  return {
    onDragOver: (event: DragEvent) => {
      if (drag.dragging.length === 0) return;
      drag.hover(target);
      if (drag.verdictFor(target).ok) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      drag.drop(target);
    },
  };
}

/** The hint a hovered target shows at its end, or nothing. */
export function TargetHint({ ctx, target }: { ctx: RowContext; target: PlacementTarget }) {
  const drag = ctx.drag;
  if (drag === undefined || drag.over === null || !samePlacement(drag.over, target)) {
    return null;
  }
  const verdict = drag.verdictFor(target);
  return verdict.ok ? (
    <DropHint
      verdict={{ ok: true, count: verdict.count, targetName: targetName(ctx.world, target) }}
    />
  ) : (
    <DropHint verdict={verdict} />
  );
}

/** One item row, draggable when the context can drag. */
export function ContentsItemRow({
  item,
  ctx,
  inBox = false,
}: {
  item: ItemRowModel;
  ctx: RowContext;
  inBox?: boolean;
}) {
  const I = INVENTORY_ICONS;
  const lifted = ctx.drag?.dragging.includes(item.id) === true;
  return (
    <div
      role="presentation"
      draggable={ctx.drag !== undefined}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        ctx.drag?.begin(item.id, ctx.selection?.selectedIds ?? []);
      }}
      onDragEnd={() => ctx.drag?.cancel()}
      className={cn(lifted && 'opacity-50')}
    >
      <ItemRow
        item={item}
        world={ctx.world}
        selectable={ctx.selection !== undefined}
        selected={ctx.selection?.isSelected(item.id) === true}
        focused={ctx.selection?.state.focusedId === item.id}
        showPlacement={false}
        onToggle={ctx.selection?.onRowToggle}
        onOpen={ctx.onOpenItem}
        verbs={
          <>
            {inBox ? (
              <RowVerb
                icon={I.takeOut}
                label="Take out"
                shortcutId="take-out"
                onClick={() => ctx.onTakeOut?.(item.id)}
              />
            ) : null}
            <RowVerb
              icon={I.pickUp}
              label="Pick up"
              shortcutId="pick-up"
              onClick={() => ctx.onPickUp?.(item.id)}
            />
            <RowVerb
              icon={I.move}
              label="Move"
              shortcutId="move"
              onClick={() => ctx.onMove?.(item.id)}
            />
          </>
        }
      />
    </div>
  );
}

function things(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

/** The header a box's contents sit under. Dropping on it puts things in the box. */
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
}) {
  const target: PlacementTarget = { kind: 'container', containerId: box.id };
  const state = ctx.drag && ctx.drag.dragging.length > 0 ? ctx.drag.stateFor(target) : 'idle';
  return (
    <div
      role="row"
      {...dropHandlers(ctx.drag, target)}
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
        <TargetHint ctx={ctx} target={target} />
        <CodeBadge code={box.code} />
      </span>
    </div>
  );
}
