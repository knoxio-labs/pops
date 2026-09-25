/**
 * One place in the tree: open/close, its symbol and name, how many things
 * are under it, and its menu. The same row is a drop target twice over:
 * for items (drop to move them here) and for another place (drop above,
 * below or inside). A refused drop says why on the row itself.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { DROP_TARGET_CLASS } from '../foundation';
import { PLACE_ICONS } from './fit-page';
import { NameInput } from './name-input';
import { PlaceMenu } from './place-menu';

import type { DragEvent } from 'react';

import type { DropTargetState } from '../foundation';
import type { PlaceMenuHandlers } from './place-menu';
import type { DropPosition } from './tree-model';
import type { TreeRow as TreeRowModel } from './tree-rows';

const INDENTS = ['pl-1', 'pl-5', 'pl-9', 'pl-13', 'pl-17', 'pl-21', 'pl-25'] as const;

/** How the row draws while something is dragged. */
export interface RowDropState {
  state: DropTargetState;
  /** Set for a place drag hovering this row. */
  position?: DropPosition;
}

/** Props for {@link TreeRow}. */
export interface TreeRowProps {
  row: TreeRowModel;
  count: number;
  selected: boolean;
  /** This row's place is the one being dragged. */
  lifted?: boolean;
  drop?: RowDropState;
  renaming?: { onCommit: (name: string) => string | null; onCancel: () => void };
  menu: PlaceMenuHandlers;
  onSelect: () => void;
  onToggle: () => void;
  onOpen: () => void;
  dragHandlers?: {
    onDragStart: (event: DragEvent) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent) => void;
    onDragEnd: () => void;
  };
}

function Toggle({ row, onToggle }: Pick<TreeRowProps, 'row' | 'onToggle'>) {
  if (!row.hasChildren) return <span className="size-7 shrink-0" aria-hidden />;
  const Icon = row.expanded ? ChevronDown : ChevronRight;
  return (
    <ButtonPrimitive
      variant="ghost"
      size="icon-xs"
      aria-label={`${row.expanded ? 'Close' : 'Open'} ${row.node.name}`}
      className="size-7 shrink-0 text-muted-foreground"
      onClick={onToggle}
    >
      <Icon className="size-3.5" aria-hidden />
    </ButtonPrimitive>
  );
}

function Label({ row, count, selected, onSelect, onOpen }: TreeRowProps) {
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
      <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
        {count > 0 ? count : null}
      </span>
    </ButtonPrimitive>
  );
}

function DropLine({ position }: { position?: DropPosition }) {
  if (position !== 'before' && position !== 'after') return null;
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

function rowTone(props: TreeRowProps): string {
  const drop = props.drop;
  if (drop && drop.position !== 'before' && drop.position !== 'after') {
    return DROP_TARGET_CLASS[drop.state];
  }
  return props.selected ? 'bg-app-accent/15' : 'hover:bg-muted/70';
}

/** One tree row. */
export function TreeRow(props: TreeRowProps) {
  const { row } = props;
  return (
    <li
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={props.selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      draggable={props.renaming === undefined}
      className={cn('relative', props.lifted && 'opacity-40')}
      {...props.dragHandlers}
    >
      <div
        className={cn(
          'group flex h-9 items-center gap-0.5 rounded-md pr-1',
          INDENTS[Math.min(row.depth, INDENTS.length - 1)],
          rowTone(props)
        )}
      >
        <Toggle row={row} onToggle={props.onToggle} />
        {props.renaming ? (
          <NameInput
            initial={row.node.name}
            label={`Rename ${row.node.name}`}
            {...props.renaming}
          />
        ) : (
          <Label {...props} />
        )}
        {props.renaming || props.drop ? null : (
          <PlaceMenu
            name={row.node.name}
            handlers={props.menu}
            className={cn(
              'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
              props.selected && 'opacity-100'
            )}
          />
        )}
      </div>
      <DropLine position={props.drop?.position} />
    </li>
  );
}
