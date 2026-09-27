import { Checkbox, cn } from '@pops/ui';

import { CodeBadge, QuantityBadge, SyncBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlaceName } from '../../foundation/badges/place-name.js';
import { returnRoute } from '../../foundation/in-hand/in-hand-model.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { RowVerb } from '../../foundation/rows/item-row.js';

import type { ReactElement, ReactNode } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Props for one item currently held in hand. */
export interface InHandRowProps {
  item: ItemRowModel;
  world: PlacementWorld;
  selected: boolean;
  focused?: boolean;
  pending: boolean;
  rejection: string | null;
  /** Offline: both verbs are off with this reason. */
  disabledReason?: string;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onPutBack: (id: string) => void;
  onMove: (id: string) => void;
  /** The open placement picker for this row, drawn under it. */
  picker?: ReactNode;
}

function Origin({ item, world }: { item: ItemRowModel; world: PlacementWorld }): ReactElement {
  const route = returnRoute(item);
  if (route.kind === 'back') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Came from</span>
        <PlaceName world={world} target={route.to} className="text-foreground" />
      </span>
    );
  }
  const text =
    route.kind === 'deleted'
      ? `${route.name} was deleted. Choose a new place`
      : 'Found loose, never placed. Choose a place';
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
      <INVENTORY_ICONS.needsAttention className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

function putBackLabel(item: ItemRowModel, world: PlacementWorld): string {
  const route = returnRoute(item);
  return route.kind === 'back' ? `Put back in ${targetName(world, route.to)}` : 'Put back';
}

function putBackReason(item: ItemRowModel, disabledReason: string | undefined): string | undefined {
  if (disabledReason !== undefined) return disabledReason;
  return returnRoute(item).kind === 'back' ? undefined : 'No place to go back to. Use Move';
}

function rowTone(rejection: string | null, selected: boolean): string {
  if (rejection !== null) return 'bg-warning/10';
  if (selected) return 'bg-app-accent/10';
  return 'hover:bg-muted/60';
}

function RowVerbs({
  item,
  world,
  disabledReason,
  onPutBack,
  onMove,
  putBackReasonValue,
}: Pick<InHandRowProps, 'item' | 'world' | 'disabledReason' | 'onPutBack' | 'onMove'> & {
  putBackReasonValue: string | undefined;
}): ReactElement {
  return (
    <span className="flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-focused:opacity-100">
      <RowVerb
        icon={INVENTORY_ICONS.putBack}
        label={putBackLabel(item, world)}
        shortcutId="put-back"
        disabledReason={putBackReasonValue}
        onClick={() => onPutBack(item.id)}
      />
      <RowVerb
        icon={INVENTORY_ICONS.move}
        label={`Move ${item.name}`}
        shortcutId="move"
        disabledReason={disabledReason}
        onClick={() => onMove(item.id)}
      />
    </span>
  );
}

function RowIdentity({
  item,
  selected,
  pending,
  onToggle,
}: Pick<InHandRowProps, 'item' | 'selected' | 'pending' | 'onToggle'>): ReactElement {
  return (
    <>
      <Checkbox
        checked={selected}
        aria-label={`Select ${item.name}`}
        onClick={(event) => {
          event.preventDefault();
          onToggle?.(item.id, event.shiftKey);
        }}
      />
      <ItemMark item={item} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium">{item.name}</span>
        <QuantityBadge quantity={item.quantity} />
        <SyncBadge sync={pending ? 'sending' : item.sync} />
      </span>
    </>
  );
}

/** Renders one in-hand item with its origin and placement verbs. */
export function InHandRow({
  item,
  world,
  selected,
  focused = false,
  pending,
  rejection,
  disabledReason,
  onToggle,
  onPutBack,
  onMove,
  picker,
}: InHandRowProps): ReactElement {
  const putBackReasonValue = putBackReason(item, disabledReason);
  return (
    <div className="relative">
      <div
        role="row"
        aria-selected={selected}
        data-focused={focused || undefined}
        className={cn(
          'group relative grid min-h-12 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.25fr)_auto_auto] items-center gap-3 border-l-2 border-transparent pr-2 pl-3',
          rowTone(rejection, selected),
          pending && 'border-l-app-accent',
          focused && 'ring-2 ring-inset ring-ring'
        )}
      >
        <RowIdentity item={item} selected={selected} pending={pending} onToggle={onToggle} />
        <Origin item={item} world={world} />
        <span className="hidden lg:inline-flex">
          <CodeBadge code={item.code} />
        </span>
        <RowVerbs
          item={item}
          world={world}
          disabledReason={disabledReason}
          onPutBack={onPutBack}
          onMove={onMove}
          putBackReasonValue={putBackReasonValue}
        />
      </div>
      {rejection !== null ? (
        <p role="alert" className="pb-2 pl-12 text-xs text-foreground">
          <span className="font-medium">Not saved.</span> {rejection}
        </p>
      ) : null}
      {picker}
    </div>
  );
}
