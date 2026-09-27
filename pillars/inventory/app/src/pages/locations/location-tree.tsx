import { Search } from 'lucide-react';
import { Fragment } from 'react';

import { Input, cn } from '@pops/ui';

import { isLifted, rowDropState, treeDragHint } from './tree-drop.js';
import { TreeRow } from './tree-row.js';

import type { KeyboardEvent, ReactElement } from 'react';

import type { PendingDelete } from '../../foundation/places/delete-place-dialog.js';
import type { DeleteMode, DeletePlan } from '../../foundation/places/delete-plan.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceEditsApi } from '../location-page/location-page-parts.js';
import type { TreeDrag } from './tree-drop.js';
import type { TreeRow as TreeRowModel } from './tree-rows.js';
import type { TreeViewApi } from './use-tree-view.js';

const CREATE_INDENTS = ['pl-8', 'pl-12', 'pl-16', 'pl-20', 'pl-24', 'pl-28'] as const;

/** The page-local edit controls shared by the tree and selected-place panel. */
export interface LocationEdits {
  readonly creatingUnder: string | null | undefined;
  readonly renamingId: string | null;
  readonly deleting: PlaceEditsApi['deleting'];
  readonly pendingDelete?: PendingDelete | null;
  readonly error: string | null;
  readonly startCreate: (parentId: string | null) => void;
  readonly commitCreate: (name: string) => void;
  readonly cancelCreate: () => void;
  readonly startRename: (id: string | null) => void;
  readonly commitRename: (name: string) => void;
  readonly moveTo: (id: string, parentId: string | null) => void;
  readonly arrange?: (id: string, parentId: string | null, order: readonly string[]) => void;
  readonly setDeleteMode?: (mode: DeleteMode) => void;
  readonly confirmDeletePlan?: (plan: DeletePlan) => void;
  readonly requestDelete: (id: string) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
}

/** Props for the Locations tree panel. */
export interface LocationTreeProps {
  readonly tree: TreeViewApi;
  readonly edits: LocationEdits;
  readonly tallyOf: (id: string) => PlaceTally;
  readonly offline: boolean;
  readonly onOpen: (id: string) => void;
  readonly onMove: (id: string) => void;
  readonly className?: string;
  readonly drag?: TreeDrag;
}

function CreateRow({ depth, edits }: { depth: number; edits: LocationEdits }): ReactElement {
  const indent = CREATE_INDENTS[Math.min(CREATE_INDENTS.length - 1, Math.max(0, depth + 1))];
  return (
    <li className={cn('flex h-10 items-center pr-1', indent)}>
      <Input
        autoFocus
        aria-label="Name of the new place"
        placeholder="Name the new place, then Enter"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            edits.commitCreate(event.currentTarget.value);
          }
          if (event.key === 'Escape') edits.cancelCreate();
        }}
        className="h-8 min-w-0 flex-1 px-2 text-sm"
      />
    </li>
  );
}

function rowFor(props: LocationTreeProps, row: TreeRowModel): ReactElement {
  const { tree, edits } = props;
  const id = row.node.id;
  const renaming =
    edits.renamingId === id
      ? { onCommit: edits.commitRename, onCancel: () => edits.startRename(null) }
      : undefined;
  return (
    <TreeRow
      key={id}
      row={row}
      count={props.tallyOf(id).total}
      selected={tree.selectedId === id}
      offline={props.offline}
      lifted={props.drag === undefined ? false : isLifted(props.drag, id)}
      drop={props.drag === undefined ? undefined : rowDropState(props.drag, id)}
      renaming={renaming}
      onSelect={() => tree.select(id)}
      onToggle={() => tree.toggle(id)}
      onOpen={() => props.onOpen(id)}
      menu={{
        onOpen: () => props.onOpen(id),
        onNewInside: () => {
          if (!row.expanded && row.hasChildren) tree.toggle(id);
          edits.startCreate(id);
        },
        onRename: () => edits.startRename(id),
        onMove: () => props.onMove(id),
        onDelete: () => edits.requestDelete(id),
      }}
    />
  );
}

function handleKey(props: LocationTreeProps, event: KeyboardEvent<HTMLUListElement>): void {
  if (event.target !== event.currentTarget) return;
  if (props.tree.onKey(event)) {
    event.preventDefault();
    return;
  }
  const id = props.tree.selectedId;
  if (id === null) return;
  if (event.key === 'Enter') props.onOpen(id);
  else if (event.key === 'e' && !props.offline) props.edits.startRename(id);
  else if (event.key === 'm' && !props.offline) props.onMove(id);
  else return;
  event.preventDefault();
}

/** Renders the filterable and keyboard-operable locations tree. */
export function LocationTree(props: LocationTreeProps): ReactElement {
  const creating = props.edits.creatingUnder;
  const empty = props.tree.rows.length === 0 && props.tree.filter.trim() !== '';
  const hint = props.drag === undefined ? null : treeDragHint(props.drag);
  return (
    <section
      aria-label="Places"
      className={cn('flex min-h-0 flex-col rounded-xl border bg-card', props.className)}
    >
      <div className="relative border-b p-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Filter places by name"
          placeholder="Filter places by name"
          value={props.tree.filter}
          onChange={(event) => props.tree.setFilter(event.target.value)}
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
        {props.tree.rows.map((row) => (
          <Fragment key={row.node.id}>
            {rowFor(props, row)}
            {creating === row.node.id ? <CreateRow depth={row.depth} edits={props.edits} /> : null}
          </Fragment>
        ))}
        {creating === null ? <CreateRow depth={-1} edits={props.edits} /> : null}
      </ul>
      {hint === null ? null : <div className="border-t px-2 py-2">{hint}</div>}
      {empty ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          No place is called “{props.tree.filter.trim()}”. Clear the filter to see every place.
        </p>
      ) : null}
    </section>
  );
}
