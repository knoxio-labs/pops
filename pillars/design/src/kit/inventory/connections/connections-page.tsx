import { HintTooltip, SelectionBar, UndoToast } from '@/kit/inventory/foundation';
import {
  InventoryPage,
  LoadFailedBody,
  OFFLINE_REASON,
  PageStateBanner,
  PageTabs,
  ScrollPanel,
  SkeletonRows,
} from '@/kit/inventory/secondary-page';
/**
 * `/inventory/connections`: the registry of what connects to what, list
 * first with a graph toggle, a trace pane beside the list, bulk disconnect
 * with undo, and Connect in the header. Fixtures is the page's second tab.
 */
import { Cable, Plus, Tag, Unlink, Waypoints } from 'lucide-react';

import { Button } from '@pops/ui';

import { ChainPanel } from './chain-panel';
import { ConnectEndsDialog } from './connect-ends-dialog';
import { RegistryGraph, RegistryList } from './registry-body';
import { RegistryToolbar } from './registry-toolbar';
import { useRegistryState } from './use-registry-state';

import type { ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';
import type { SelectionBarAction } from '@/kit/inventory/foundation';
import type { PageBanner } from '@/kit/inventory/secondary-page';

import type { ConnectSeed } from './connect-ends-dialog';
import type { ConnectionIndex } from './connection-model';
import type { RegistrySeed, RegistryState } from './use-registry-state';

/** The Connections and Fixtures tabs. */
export function ConnectionsTabs({
  value,
  counts,
  onChange,
}: {
  value: 'connections' | 'fixtures';
  counts: { connections: number; fixtures: number };
  onChange?: (value: 'connections' | 'fixtures') => void;
}) {
  return (
    <PageTabs
      label="Connections and fixtures"
      value={value}
      onChange={onChange}
      tabs={[
        { value: 'connections', label: 'Connections', count: counts.connections },
        { value: 'fixtures', label: 'Fixtures', count: counts.fixtures },
      ]}
    />
  );
}

/** Props for {@link ConnectionsPage}. */
export interface ConnectionsPageProps {
  connections: readonly ConnectionModel[];
  index: ConnectionIndex;
  status?: 'ready' | 'loading' | 'error';
  banner?: PageBanner;
  seed?: RegistrySeed;
  connectSeed?: ConnectSeed;
  onNavigate?: (to: string) => void;
}

function bulkActions(state: RegistryState, offline: boolean): SelectionBarAction[] {
  const count = state.selection.count;
  const one =
    count === 1 ? state.rows.find((row) => state.selection.isSelected(row.edge.id)) : undefined;
  return [
    {
      id: 'disconnect',
      label: `Disconnect ${count}`,
      icon: Unlink,
      disabledReason: offline ? OFFLINE_REASON : undefined,
      onSelect: () => {
        state.disconnect(state.selection.selectedIds);
        state.selection.clearSelection();
      },
    },
    {
      id: 'trace',
      label: 'Trace',
      icon: Waypoints,
      disabledReason: one === undefined ? 'Trace works on one connection at a time.' : undefined,
      onSelect: () => state.trace(one?.item.id ?? null),
    },
    { id: 'label', label: 'Print labels', icon: Tag, shortcutId: 'label' },
  ];
}

function Body({ props, state }: { props: ConnectionsPageProps; state: RegistryState }) {
  const offline = props.banner === 'offline';
  const handlers = {
    onOpen: (key: string) => props.onNavigate?.(key),
    onConnect: () => state.setConnectOpen(true),
    lockedReason: offline ? OFFLINE_REASON : undefined,
  };
  if (props.status === 'loading')
    return (
      <ScrollPanel>
        <SkeletonRows />
      </ScrollPanel>
    );
  if (props.status === 'error')
    return (
      <ScrollPanel>
        <LoadFailedBody what="Connections" />
      </ScrollPanel>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <RegistryToolbar state={state} />
      <div className="flex min-h-0 flex-1 gap-4">
        {state.view === 'graph' ? (
          <RegistryGraph state={state} index={props.index} />
        ) : (
          <RegistryList state={state} index={props.index} handlers={handlers} />
        )}
        {state.chain === null ? null : (
          <ChainPanel
            chain={state.chain}
            onClose={() => state.trace(null)}
            onOpen={handlers.onOpen}
          />
        )}
      </div>
      <SelectionBar
        count={state.selection.count}
        loadedCount={state.rows.length}
        coverage={state.selection.coverage}
        actions={bulkActions(state, offline)}
        carriedCount={0}
        onSelectAll={state.selection.onHeaderToggle}
        onClear={state.selection.clearSelection}
      />
    </div>
  );
}

function edgeLabel(edge: ConnectionModel, index: ConnectionIndex): string {
  const from = index.world.items.get(edge.itemId)?.name ?? 'item';
  const to =
    edge.to.kind === 'item'
      ? index.world.items.get(edge.to.itemId)?.name
      : index.fixtures.get(edge.to.fixtureId)?.name;
  return `${from} from ${to ?? 'its other end'}`;
}

function ConnectButton({ offline, onClick }: { offline: boolean; onClick: () => void }) {
  return (
    <HintTooltip label="Connect two things" disabledReason={offline ? OFFLINE_REASON : undefined}>
      <Button
        aria-disabled={offline || undefined}
        className={offline ? 'opacity-50' : undefined}
        prefix={<Plus className="size-4" aria-hidden />}
        onClick={offline ? undefined : onClick}
      >
        Connect
      </Button>
    </HintTooltip>
  );
}

/** The connections page. */
export function ConnectionsPage(props: ConnectionsPageProps) {
  const state = useRegistryState(props.connections, props.index, props.seed);
  const undone = state.removed.length;
  const removedEdge = props.connections.find((edge) => edge.id === state.removed[0]);
  const message =
    undone === 1 && removedEdge !== undefined
      ? `Disconnected ${edgeLabel(removedEdge, props.index)}`
      : `Disconnected ${undone} connections`;
  return (
    <InventoryPage
      icon={Cable}
      title="Connections"
      description="What plugs into, feeds or pairs with what, across the house."
      actions={
        <ConnectButton
          offline={props.banner === 'offline'}
          onClick={() => state.setConnectOpen(true)}
        />
      }
      tabs={
        <ConnectionsTabs
          value="connections"
          counts={{ connections: state.total, fixtures: props.index.fixtures.size }}
          onChange={(tab) => props.onNavigate?.(tab)}
        />
      }
      banner={<PageStateBanner banner={props.banner} what="Connections" />}
    >
      <Body props={props} state={state} />
      <ConnectEndsDialog
        open={state.connectOpen}
        onOpenChange={state.setConnectOpen}
        index={props.index}
        connections={state.live}
        seed={props.connectSeed}
      />
      {undone > 0 ? (
        <UndoToast
          concept="connection"
          message={message}
          onUndo={state.undo}
          className="fixed right-6 bottom-6 z-50"
        />
      ) : null}
    </InventoryPage>
  );
}
