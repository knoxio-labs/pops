import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
} from '../badges/badges';
import { ItemMark } from '../badges/item-mark';
import { PlacementPath } from '../badges/placement-path';
import { HintTooltip } from '../shortcuts/hint-tooltip';

import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import type { ItemRowModel } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

/** Row height: compact is the default list density. */
export type RowDensity = 'compact' | 'comfortable';

/** Props for {@link ItemRow}. */
export interface ItemRowProps {
  item: ItemRowModel;
  world: PlacementWorld;
  density?: RowDensity;
  /** Draws the checkbox. Lists that act in bulk pass it; pickers do not. */
  selectable?: boolean;
  selected?: boolean;
  focused?: boolean;
  /** Applied optimistically and not yet acknowledged: the accent edge, never a spinner. */
  pending?: boolean;
  /** The server refused the change and the row went back; the reason, inline. */
  rejection?: string | null;
  showPlacement?: boolean;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onOpen?: (id: string) => void;
  /** Trailing verbs, usually {@link RowVerb}s. */
  verbs?: ReactNode;
}

function rowTone({ selected, rejection }: Pick<ItemRowProps, 'selected' | 'rejection'>): string {
  if (rejection) return 'bg-warning/10';
  return selected ? 'bg-app-accent/10' : 'hover:bg-muted/60';
}

function RowTitle({ item, onOpen }: { item: ItemRowModel; onOpen?: (id: string) => void }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto min-w-0 shrink justify-start gap-2 px-0 text-sm font-medium hover:bg-transparent"
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

function RowTrail({
  item,
  world,
  showPlacement,
  verbs,
}: Pick<ItemRowProps, 'item' | 'world' | 'showPlacement' | 'verbs'>) {
  return (
    <>
      {showPlacement === false ? null : (
        <PlacementPath
          world={world}
          placement={item.placement}
          maxSegments={2}
          className="hidden w-64 shrink-0 md:inline-flex"
        />
      )}
      <span className="hidden w-20 shrink-0 whitespace-nowrap lg:inline-flex">
        <CodeBadge code={item.code} />
      </span>
      {verbs ? (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-focused:opacity-100">
          {verbs}
        </span>
      ) : null}
    </>
  );
}

function rowClass(props: ItemRowProps): string {
  return cn(
    'group relative border-l-2 border-transparent',
    rowTone(props),
    props.pending && 'border-l-app-accent',
    props.focused && 'ring-2 ring-inset ring-ring'
  );
}

/** One list row. */
export function ItemRow(props: ItemRowProps) {
  const { item, selectable = false, selected = false } = props;
  return (
    <div
      role="row"
      aria-selected={selectable ? selected : undefined}
      data-focused={props.focused === true ? true : undefined}
      className={rowClass(props)}
    >
      <div
        className={cn(
          'flex items-center gap-3 pr-2 pl-3',
          props.density === 'comfortable' ? 'h-11' : 'h-9'
        )}
      >
        {selectable ? (
          <Checkbox
            checked={selected}
            aria-label={`Select ${item.name}`}
            onClick={(event) => {
              event.preventDefault();
              props.onToggle?.(item.id, event.shiftKey);
            }}
          />
        ) : null}
        <ItemMark item={item} />
        <RowTitle item={item} onOpen={props.onOpen} />
        <RowTrail
          item={item}
          world={props.world}
          showPlacement={props.showPlacement}
          verbs={props.verbs}
        />
      </div>
      {props.rejection ? (
        <p role="alert" className="pb-2 pl-12 text-xs text-foreground">
          <span className="font-medium">Not saved.</span> {props.rejection}
        </p>
      ) : null}
    </div>
  );
}

/** Props for the keyboard-capable grid wrapper. */
export interface ItemListProps {
  label: string;
  children: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** A selectable grid wrapper that can receive list keyboard shortcuts. */
export function ItemList({ label, children, onKeyDown }: ItemListProps) {
  return (
    <div
      role="grid"
      aria-label={label}
      aria-multiselectable
      tabIndex={onKeyDown ? 0 : undefined}
      onKeyDown={onKeyDown}
      className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </div>
  );
}

/** Props for {@link RowVerb}. */
export interface RowVerbProps {
  icon: LucideIcon;
  label: string;
  shortcutId?: string;
  disabledReason?: string;
  onClick?: () => void;
}

/** One icon verb at the end of a row, with its label and key in the tooltip. */
export function RowVerb({ icon: Icon, label, shortcutId, disabledReason, onClick }: RowVerbProps) {
  return (
    <HintTooltip label={label} shortcutId={shortcutId} disabledReason={disabledReason}>
      <ButtonPrimitive
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-disabled={disabledReason !== undefined || undefined}
        className={cn('text-muted-foreground', disabledReason !== undefined && 'opacity-50')}
        onClick={disabledReason === undefined ? onClick : undefined}
      >
        <Icon className="size-4" aria-hidden />
      </ButtonPrimitive>
    </HintTooltip>
  );
}
