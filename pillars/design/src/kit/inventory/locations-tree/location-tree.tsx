/**
 * The tree panel: a filter over place names, the tree itself (the only
 * part that scrolls), and the inline row a new place is typed into. The
 * tree takes the keyboard: j and k walk it, the arrows open and close,
 * Enter opens a place's page, e renames and m moves.
 */
import { Search } from 'lucide-react';

import { Input, cn } from '@pops/ui';

import { NameInput } from './name-input';
import { isLifted, rowDragHandlers, rowDropState, treeDragHint } from './tree-drop';
import { tallyPlace } from './tree-model';
import { TreeRow } from './tree-row';

import type { KeyboardEvent } from 'react';

import type { TreeRow as TreeRowModel } from './tree-rows';
import type { LocationsApi } from './use-locations';

/** Where the tree hands off: opening a place's page and opening the Move picker. */
export interface LocationTreeProps {
  api: LocationsApi;
  onOpen: (id: string) => void;
  onMove: (id: string) => void;
  className?: string;
}

function CreateRow({ api, depth }: { api: LocationsApi; depth: number }) {
  const indent = ['pl-8', 'pl-12', 'pl-16', 'pl-20', 'pl-24', 'pl-28'][Math.min(depth, 5)];
  return (
    <li className={cn('flex h-10 items-center pr-1', indent)}>
      <NameInput
        label="Name of the new place"
        placeholder="Name the new place, then Enter"
        onCommit={api.edits.commitCreate}
        onCancel={() => api.edits.startCreate(undefined)}
      />
    </li>
  );
}

function rowFor(props: LocationTreeProps, row: TreeRowModel) {
  const { api } = props;
  const id = row.node.id;
  const renaming =
    api.edits.renamingId === id
      ? { onCommit: api.edits.commitRename, onCancel: () => api.edits.startRename(null) }
      : undefined;
  return (
    <TreeRow
      key={id}
      row={row}
      count={tallyPlace(api.world, id).total}
      selected={api.tree.selectedId === id}
      lifted={isLifted(api.world, api, id)}
      drop={rowDropState(api, id)}
      renaming={renaming}
      onSelect={() => api.tree.select(id)}
      onToggle={() => api.tree.toggle(id)}
      onOpen={() => props.onOpen(id)}
      dragHandlers={rowDragHandlers(api, id)}
      menu={{
        onOpen: () => props.onOpen(id),
        onNewInside: () => {
          if (!row.expanded && row.hasChildren) api.tree.toggle(id);
          api.edits.startCreate(id);
        },
        onRename: () => api.edits.startRename(id),
        onMove: () => props.onMove(id),
        onDelete: () => api.edits.requestDelete(id),
      }}
    />
  );
}

function handleKey(props: LocationTreeProps, event: KeyboardEvent<HTMLElement>): void {
  if (event.target !== event.currentTarget) return;
  const { api } = props;
  const id = api.tree.selectedId;
  if (api.tree.onKey(event.key)) {
    event.preventDefault();
    return;
  }
  if (id === null) return;
  if (event.key === 'Enter') props.onOpen(id);
  else if (event.key === 'e') api.edits.startRename(id);
  else if (event.key === 'm') props.onMove(id);
  else return;
  event.preventDefault();
}

function TreeItems(props: LocationTreeProps) {
  const { api } = props;
  const creating = api.edits.creatingUnder;
  const items = api.tree.rows.flatMap((row) => {
    const out = [rowFor(props, row)];
    if (creating === row.node.id) out.push(<CreateRow key="create" api={api} depth={row.depth} />);
    return out;
  });
  if (creating === null) items.push(<CreateRow key="create" api={api} depth={-1} />);
  return <>{items}</>;
}

function TreeFooter({ api, empty }: { api: LocationsApi; empty: boolean }) {
  const hint = treeDragHint(api);
  if (hint !== null) return <div className="border-t px-2 py-2">{hint}</div>;
  if (!empty) return null;
  return (
    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
      No place is called “{api.tree.filter.trim()}”. Clear the filter to see every place.
    </p>
  );
}

/** The tree panel. */
export function LocationTree(props: LocationTreeProps) {
  const { api } = props;
  const empty = api.tree.rows.length === 0 && api.tree.filter.trim() !== '';
  return (
    <section
      aria-label="Places"
      className={cn('flex min-h-0 flex-col rounded-xl border bg-card', props.className)}
    >
      <div className="relative border-b p-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Filter places by name"
          placeholder="Filter places by name"
          value={api.tree.filter}
          onChange={(event) => api.tree.setFilter(event.target.value)}
          className="h-9 pl-8"
        />
      </div>
      <ul
        role="tree"
        aria-label="Places"
        tabIndex={0}
        onKeyDown={(event) => handleKey(props, event)}
        className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <TreeItems {...props} />
      </ul>
      <TreeFooter api={api} empty={empty} />
    </section>
  );
}
