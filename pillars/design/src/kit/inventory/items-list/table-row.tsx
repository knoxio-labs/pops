/**
 * One row of the item table: the same row model and badges as the shared
 * {@link ItemRow}, laid out in columns under a header so a long list can be
 * scanned by type, place and code. Selection tint, the keyboard focus ring,
 * the optimistic accent edge and an inline rejection are row states.
 */
import { MoreHorizontal } from 'lucide-react';

import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  INVENTORY_ICONS,
  ItemMark,
  LifecycleBadge,
  PlacementPath,
  QuantityBadge,
  RowVerb,
  SyncBadge,
  TypeLabel,
} from '../foundation';
import { COLUMN } from './table-columns';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** Row height: `default` is 36px, `compact` 32px. */
export type TableDensity = 'default' | 'compact';

/** Props for {@link TableRow}. */
export interface TableRowProps {
  item: ItemRowModel;
  world: PlacementWorld;
  density: TableDensity;
  selected: boolean;
  focused: boolean;
  pending?: boolean;
  rejection?: string | null;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onOpen?: (id: string) => void;
  /** Replaces the Type cell: the Containers browser shows what a box holds there. */
  secondCell?: ReactNode;
}

const thisYear = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
const otherYear = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' });

function shortDate(iso: string): string {
  const date = new Date(iso);
  return date.getUTCFullYear() === new Date().getUTCFullYear()
    ? thisYear.format(date)
    : otherYear.format(date);
}

function RowVerbs({ item }: { item: ItemRowModel }) {
  const inHand = item.placement.kind === 'in-hand';
  return (
    <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-focused:opacity-100">
      {inHand ? (
        <RowVerb icon={INVENTORY_ICONS.putBack} label="Put back" shortcutId="pick-up" />
      ) : (
        <RowVerb icon={INVENTORY_ICONS.pickUp} label="Pick up" shortcutId="pick-up" />
      )}
      <RowVerb icon={INVENTORY_ICONS.move} label="Move" shortcutId="move" />
      <RowVerb icon={MoreHorizontal} label="More" shortcutId="row-menu" />
    </span>
  );
}

function NameCell({ item, onOpen }: { item: ItemRowModel; onOpen?: (id: string) => void }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ItemMark item={item} />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent"
        aria-label={`Open ${item.name}`}
        onClick={() => onOpen?.(item.id)}
      >
        <span className="truncate">{item.name}</span>
      </ButtonPrimitive>
      <QuantityBadge quantity={item.quantity} />
      <ContainerStateBadge container={item.container} />
      <LifecycleBadge lifecycle={item.lifecycle} />
      <SyncBadge sync={item.sync} />
    </span>
  );
}

function rowTone(props: TableRowProps): string {
  if (props.rejection) return 'bg-warning/10';
  return props.selected ? 'bg-app-accent/10' : 'hover:bg-muted/60';
}

/** One table row. */
export function TableRow(props: TableRowProps) {
  const { item, world } = props;
  return (
    <div
      role="row"
      aria-selected={props.selected}
      data-focused={props.focused || undefined}
      className={cn(
        'group relative border-l-2 border-transparent',
        rowTone(props),
        props.pending && 'border-l-app-accent',
        props.focused && 'ring-2 ring-inset ring-ring'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 pr-2 pl-3 text-sm',
          props.density === 'compact' ? 'h-8' : 'h-9'
        )}
      >
        <Checkbox
          checked={props.selected}
          aria-label={`Select ${item.name}`}
          onClick={(event) => {
            event.preventDefault();
            props.onToggle?.(item.id, event.shiftKey);
          }}
        />
        <NameCell item={item} onOpen={props.onOpen} />
        <span className={COLUMN.type}>
          {props.secondCell ?? <TypeLabel typeName={item.typeName} />}
        </span>
        <PlacementPath
          world={world}
          placement={item.placement}
          maxSegments={2}
          className={COLUMN.where}
        />
        <span className={COLUMN.code}>
          <CodeBadge code={item.code} />
        </span>
        <span className={COLUMN.trail}>
          <span className="hidden h-full items-center text-xs tabular-nums text-muted-foreground group-focus-within:invisible group-hover:invisible group-data-focused:invisible lg:flex">
            {shortDate(item.updatedAt)}
          </span>
          <RowVerbs item={item} />
        </span>
      </div>
      {props.rejection ? (
        <p role="alert" className="pb-2 pl-12 text-xs text-foreground">
          <span className="font-medium">Not saved.</span> {props.rejection}
        </p>
      ) : null}
    </div>
  );
}
