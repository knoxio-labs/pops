import { ChevronDown, ChevronRight } from 'lucide-react';

import { ButtonPrimitive, Input, cn } from '@pops/ui';

import { DROP_TARGET_CLASS } from '../../foundation/drag/drag-dock.js';
import { PLACE_ICONS } from '../../foundation/places/place-icons.js';
import { PlaceMenu } from './place-menu.js';

import type { ReactElement } from 'react';

import type { RowDropState } from './tree-drop.js';
import type { TreeRowProps } from './tree-row.js';
import type { TreeRow as TreeRowModel } from './tree-rows.js';

const INDENTS = ['pl-1', 'pl-5', 'pl-9', 'pl-13', 'pl-17', 'pl-21', 'pl-25'] as const;

function InlineNameInput({
  initial,
  label,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <Input
      autoFocus
      aria-label={label}
      defaultValue={initial}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
        if (event.key === 'Escape') onCancel();
      }}
      className="h-8 min-w-0 flex-1 px-2 text-sm"
    />
  );
}

function Toggle({ row, onToggle }: Pick<TreeRowProps, 'row' | 'onToggle'>): ReactElement {
  if (!row.hasChildren) return <span className="size-7 shrink-0" aria-hidden />;
  const Icon = row.expanded ? ChevronDown : ChevronRight;
  return (
    <ButtonPrimitive
      variant="ghost"
      size="icon-xs"
      aria-label={`${row.expanded ? 'Close' : 'Open'} ${row.node.name}`}
      className="size-7 shrink-0 text-muted-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon className="size-3.5" aria-hidden />
    </ButtonPrimitive>
  );
}

function RowLabel({
  row,
  count,
  selected,
  onSelect,
  onOpen,
}: {
  row: TreeRowModel;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}): ReactElement {
  const Icon = PLACE_ICONS[row.node.kind];
  return (
    <ButtonPrimitive
      variant="ghost"
      size="sm"
      className="h-8 min-w-0 flex-1 justify-start gap-2 px-1.5 font-normal hover:bg-transparent"
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <Icon
        className={cn('size-4 shrink-0', selected ? 'text-app-accent' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className={cn('truncate', (selected || row.matched) && 'font-medium')}>
        {row.node.name}
      </span>
      {count > 0 ? (
        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </ButtonPrimitive>
  );
}

function rowTone(drop: RowDropState | undefined, selected: boolean): string {
  if (drop !== undefined && drop.position !== 'before' && drop.position !== 'after') {
    return DROP_TARGET_CLASS[drop.state];
  }
  return selected ? 'bg-app-accent/15' : 'hover:bg-muted/70';
}

/** Renders the interactive surface inside one location tree row. */
export function TreeRowSurface(props: TreeRowProps): ReactElement {
  const { row } = props;
  const tone = rowTone(props.drop, props.selected);
  return (
    <div
      className={cn(
        'group flex h-9 items-center gap-0.5 rounded-md pr-1',
        INDENTS[Math.min(row.depth, INDENTS.length - 1)],
        tone
      )}
    >
      <Toggle row={row} onToggle={props.onToggle} />
      {props.renaming ? (
        <InlineNameInput
          initial={row.node.name}
          label={`Rename ${row.node.name}`}
          onCommit={props.renaming.onCommit}
          onCancel={props.renaming.onCancel}
        />
      ) : (
        <RowLabel
          row={row}
          count={props.count}
          selected={props.selected}
          onSelect={props.onSelect}
          onOpen={props.onOpen}
        />
      )}
      {props.renaming ? null : (
        <PlaceMenu
          name={row.node.name}
          offline={props.offline}
          handlers={props.menu}
          className={cn(
            'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            props.selected && 'opacity-100'
          )}
        />
      )}
    </div>
  );
}

/** Renders the before/after insertion marker for a tree row. */
export function DropLine({
  position,
  visible,
}: {
  position: 'before' | 'after';
  visible: boolean;
}): ReactElement | null {
  if (!visible) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute right-2 left-8 h-0.5 rounded-full bg-app-accent',
        position === 'before' ? '-top-px' : '-bottom-px'
      )}
    />
  );
}
