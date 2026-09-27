import { Cable } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Checkbox, EmptyState } from '@pops/ui';

import {
  EmptyFiltered,
  ListBody,
  ListError,
  ListSkeleton,
} from '../../foundation/list-page/list-states.js';
import { connectionRoom, type ConnectionRow, type ResolvedEnd } from './connection-model.js';
import { CONNECTION_GRID, ConnectionListRow } from './connections-list-row.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';

export { CONNECTION_GRID } from './connections-list-row.js';

/** Props for the connection registry list body. */
export interface ConnectionsListProps {
  rows: readonly ConnectionRow[];
  world: PlacementWorld;
  selection: SelectionApi;
  traceItemId: string | null;
  online: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onOpen: (end: ResolvedEnd) => void;
  onTrace: (row: ConnectionRow) => void;
  onDisconnect: (row: ConnectionRow) => void;
  onClearFilters: () => void;
  onRetry: () => void;
  loading: boolean;
  error: boolean;
  narrowed: boolean;
  disconnectingIds: ReadonlySet<string>;
}

function checkedState(selection: SelectionApi): boolean | 'indeterminate' {
  if (selection.coverage === 'some') return 'indeterminate';
  return selection.coverage === 'all';
}

function Header({ selection }: { selection: SelectionApi }): ReactElement {
  return (
    <div
      role="row"
      className={`grid h-10 items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground ${CONNECTION_GRID}`}
    >
      <Checkbox
        checked={checkedState(selection)}
        aria-label="Select every connection shown"
        onClick={(event) => {
          event.preventDefault();
          selection.onHeaderToggle();
        }}
      />
      <span>Item</span>
      <span aria-hidden />
      <span>Connected to</span>
      <span>Room</span>
      <span>Since</span>
      <span className="sr-only">Actions</span>
    </div>
  );
}

function Sentinel({
  loadedRows,
  onLoadMore,
}: {
  loadedRows: number;
  onLoadMore: () => void;
}): ReactElement {
  const fetchNextPageRef = useRef(onLoadMore);

  useEffect(() => {
    fetchNextPageRef.current = onLoadMore;
  });

  const sentinelRef = useCallback((node: HTMLDivElement | null): (() => void) | void => {
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      fetchNextPageRef.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      key={loadedRows}
      ref={sentinelRef}
      data-testid="connections-sentinel"
      aria-hidden
      className="h-px"
    />
  );
}

function ConnectionRows({
  rows,
  world,
  selection,
  traceItemId,
  online,
  disconnectingIds,
  onOpen,
  onTrace,
  onDisconnect,
}: Pick<
  ConnectionsListProps,
  | 'rows'
  | 'world'
  | 'selection'
  | 'traceItemId'
  | 'online'
  | 'disconnectingIds'
  | 'onOpen'
  | 'onTrace'
  | 'onDisconnect'
>): ReactElement {
  return (
    <div
      role="grid"
      aria-label="Connections"
      aria-multiselectable
      tabIndex={0}
      className="divide-y divide-border/60 outline-none"
      onKeyDown={(event) => {
        if (selection.onKey(event)) event.preventDefault();
      }}
    >
      {rows.map((row) => (
        <ConnectionListRow
          key={row.id}
          row={row}
          room={connectionRoom(row, world)}
          selected={selection.isSelected(row.id)}
          traced={traceItemId === row.item.id}
          online={online}
          disconnecting={disconnectingIds.has(row.id)}
          onOpen={onOpen}
          onTrace={onTrace}
          onDisconnect={onDisconnect}
          onToggle={selection.onRowToggle}
        />
      ))}
    </div>
  );
}

function EmptyRows({
  narrowed,
  onClearFilters,
}: Pick<ConnectionsListProps, 'narrowed' | 'onClearFilters'>): ReactElement {
  if (narrowed) return <EmptyFiltered noun="connections" onClear={onClearFilters} />;
  return (
    <EmptyState
      icon={Cable}
      title="Nothing is connected yet"
      description="Connect a television to its soundbar, or a router to the network port it uses."
    />
  );
}

/** Renders loading, error, empty, filtered-empty, and server-ordered rows. */
export function ConnectionsList({
  rows,
  world,
  selection,
  traceItemId,
  online,
  hasNextPage,
  onLoadMore,
  onOpen,
  onTrace,
  onDisconnect,
  onClearFilters,
  onRetry,
  loading,
  error,
  narrowed,
  disconnectingIds,
}: ConnectionsListProps): ReactElement {
  if (loading) return <ListSkeleton label="Loading connections" />;
  if (error) return <ListError noun="connections" onRetry={onRetry} />;

  return (
    <ListBody>
      <Header selection={selection} />
      {rows.length === 0 ? (
        <EmptyRows narrowed={narrowed} onClearFilters={onClearFilters} />
      ) : (
        <ConnectionRows
          rows={rows}
          world={world}
          selection={selection}
          traceItemId={traceItemId}
          online={online}
          disconnectingIds={disconnectingIds}
          onOpen={onOpen}
          onTrace={onTrace}
          onDisconnect={onDisconnect}
        />
      )}
      {hasNextPage ? <Sentinel loadedRows={rows.length} onLoadMore={onLoadMore} /> : null}
    </ListBody>
  );
}
