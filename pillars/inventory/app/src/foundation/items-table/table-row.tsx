/** One item-table row and the row-specific cells it composes. */
import { MoreHorizontal } from 'lucide-react';

import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../badges/badges';
import { ItemMark } from '../badges/item-mark';
import { PlacementPath } from '../badges/placement-path';
import { INVENTORY_ICONS } from '../model/icons';
import { RowVerb } from '../rows/item-row';
import { useColumnClass } from './column-resize';

import type { ComponentType, ReactElement } from 'react';

import type { ItemRowModel } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

/** The row height variant. Default rows are 36px; compact rows are 32px. */
export type TableDensity = 'default' | 'compact';

/** The actions available in the Updated cell of a table row. */
export type RowVerbId = 'pick-up' | 'put-back' | 'move' | 'more';

/** The props for {@link TableRow}. */
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
  onRowVerb?: (verb: RowVerbId, item: ItemRowModel) => void;
  SecondCell?: SecondColumn['Cell'];
}

/** A browser-specific cell that replaces the Type cell. */
export interface SecondColumn {
  header: string;
  Cell: ComponentType<{ item: ItemRowModel; world: PlacementWorld }>;
}

const thisYear = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
const otherYear = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' });

function shortDate(iso: string): string {
  const date = new Date(iso);
  return date.getUTCFullYear() === new Date().getUTCFullYear()
    ? thisYear.format(date)
    : otherYear.format(date);
}

function RowVerbs({
  item,
  onRowVerb,
}: {
  item: ItemRowModel;
  onRowVerb?: (verb: RowVerbId, item: ItemRowModel) => void;
}): ReactElement {
  const inHand = item.placement.kind === 'in-hand';
  return (
    <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-focused:opacity-100">
      {inHand ? (
        <RowVerb
          icon={INVENTORY_ICONS.putBack}
          label="Put back"
          shortcutId="pick-up"
          onClick={() => onRowVerb?.('put-back', item)}
        />
      ) : (
        <RowVerb
          icon={INVENTORY_ICONS.pickUp}
          label="Pick up"
          shortcutId="pick-up"
          onClick={() => onRowVerb?.('pick-up', item)}
        />
      )}
      <RowVerb
        icon={INVENTORY_ICONS.move}
        label="Move"
        shortcutId="move"
        onClick={() => onRowVerb?.('move', item)}
      />
      <RowVerb
        icon={MoreHorizontal}
        label="More"
        shortcutId="row-menu"
        onClick={() => onRowVerb?.('more', item)}
      />
    </span>
  );
}

function NameCell({
  item,
  onOpen,
}: {
  item: ItemRowModel;
  onOpen?: (id: string) => void;
}): ReactElement {
  return (
    <span
      data-col="name"
      className={cn(useColumnClass('name'), 'flex items-center gap-2 overflow-hidden')}
    >
      <ItemMark item={item} />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto min-w-24 shrink justify-start px-0 text-sm font-medium hover:bg-transparent"
        aria-label={`Open ${item.name}`}
        onClick={() => onOpen?.(item.id)}
      >
        <span className="truncate">{item.name}</span>
      </ButtonPrimitive>
      <span className="hidden min-w-0 shrink items-center gap-1 overflow-hidden lg:flex">
        <QuantityBadge quantity={item.quantity} />
        <ContainerStateBadge container={item.container} />
        <LifecycleBadge lifecycle={item.lifecycle} />
        <SyncBadge sync={item.sync} />
      </span>
    </span>
  );
}

function useRowColumns() {
  return {
    type: useColumnClass('type'),
    where: useColumnClass('where'),
    code: useColumnClass('code'),
    updated: useColumnClass('updated'),
  };
}

function rowTone(props: TableRowProps): string {
  if (props.rejection) return 'bg-warning/10';
  return props.selected ? 'bg-app-accent/10' : 'hover:bg-muted/60';
}

/** Renders one selectable, keyboard-focused item row. */
export function TableRow(props: TableRowProps): ReactElement {
  const { item, world } = props;
  const col = useRowColumns();
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
        <span data-col="type" className={col.type}>
          {props.SecondCell ? (
            <props.SecondCell item={item} world={world} />
          ) : (
            <TypeLabel typeName={item.typeName} />
          )}
        </span>
        <span data-col="where" className={cn(col.where, 'flex items-center overflow-hidden')}>
          <PlacementPath world={world} placement={item.placement} maxSegments={2} />
        </span>
        <span data-col="code" className={col.code}>
          <CodeBadge code={item.code} />
        </span>
        <span data-col="updated" className={col.updated}>
          <span className="hidden h-full items-center text-xs tabular-nums text-muted-foreground group-focus-within:invisible group-hover:invisible group-data-focused:invisible lg:flex">
            {shortDate(item.updatedAt)}
          </span>
          <RowVerbs item={item} onRowVerb={props.onRowVerb} />
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
