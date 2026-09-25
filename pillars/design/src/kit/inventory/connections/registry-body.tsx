import { roomOf } from '@/kit/inventory/reports/report-model';
import { ColumnHeader, EmptyBody, NoMatchBody, ScrollPanel } from '@/kit/inventory/secondary-page';
/**
 * The registry's list and graph bodies. The list is keyboard driven with
 * the shared selection keys; the graph draws the same edges, fixtures in
 * their own colour, and is for seeing clusters, not for acting on rows.
 */
import { Cable } from 'lucide-react';

import { Button, Checkbox } from '@pops/ui';

import { ConnectionGraph } from './connection-graph';
import { registryGraph } from './connection-trace';
import { REGISTRY_GRID, RegistryRow } from './registry-row';

import type { ConnectionIndex } from './connection-model';
import type { RegistryState } from './use-registry-state';

/** Callbacks the list rows raise. */
export interface RegistryHandlers {
  onOpen?: (key: string) => void;
  onConnect?: () => void;
  lockedReason?: string;
}

function headerChecked(
  coverage: RegistryState['selection']['coverage']
): boolean | 'indeterminate' {
  if (coverage === 'some') return 'indeterminate';
  return coverage === 'all';
}

function ListHeader({ state }: { state: RegistryState }) {
  return (
    <ColumnHeader className={REGISTRY_GRID}>
      <Checkbox
        checked={headerChecked(state.selection.coverage)}
        aria-label="Select every connection shown"
        onClick={(event) => {
          event.preventDefault();
          state.selection.onHeaderToggle();
        }}
      />
      <span>Item</span>
      <span aria-hidden />
      <span>Connected to</span>
      <span className="hidden @3xl:block">Item is in</span>
      <span className="hidden @3xl:block">Since</span>
      <span className="sr-only">Actions</span>
    </ColumnHeader>
  );
}

/** The registry as rows. */
export function RegistryList({
  state,
  index,
  handlers,
}: {
  state: RegistryState;
  index: ConnectionIndex;
  handlers: RegistryHandlers;
}) {
  if (state.total === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={Cable}
          title="Nothing is connected yet"
          description="Connect a television to its soundbar, or a router to the network port it uses."
          action={<Button onClick={handlers.onConnect}>Connect</Button>}
        />
      </ScrollPanel>
    );
  }
  return (
    <ScrollPanel label="Connections" className="@container" header={<ListHeader state={state} />}>
      {state.rows.length === 0 ? (
        <NoMatchBody what="connections" onClear={state.clearFilters} />
      ) : (
        <div
          role="grid"
          aria-label="Connections"
          aria-multiselectable
          tabIndex={0}
          className="divide-y divide-border/60 outline-none"
          onKeyDown={(event) => {
            if (state.selection.onKey(event)) event.preventDefault();
          }}
        >
          {state.rows.map((row) => (
            <RegistryRow
              key={row.edge.id}
              row={row}
              room={roomOf(index.world, row.item.id).name}
              selected={state.selection.isSelected(row.edge.id)}
              focused={state.selection.state.focusedId === row.edge.id}
              traced={state.chain?.root.key === `item:${row.item.id}`}
              onToggle={state.selection.onRowToggle}
              onOpen={handlers.onOpen}
              onTrace={state.trace}
              onDisconnect={(id) => state.disconnect([id])}
              lockedReason={handlers.lockedReason}
            />
          ))}
        </div>
      )}
    </ScrollPanel>
  );
}

/** The registry as a graph, with its legend. */
export function RegistryGraph({ state, index }: { state: RegistryState; index: ConnectionIndex }) {
  const graph = registryGraph(
    state.rows.map((row) => row.edge),
    index
  );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ConnectionGraph itemId="" status="ready" data={graph} className="h-full min-h-80" />
      <p className="absolute bottom-2 left-3 text-xs text-muted-foreground">
        {graph.nodes.length} things, {graph.edges.length} connections. Select one to open it.
      </p>
    </div>
  );
}
