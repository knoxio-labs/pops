import { Cable, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { OFFLINE_REASON, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ListError, ListSkeleton, OfflineBanner } from '../../foundation/list-page/list-states.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ConnectEndsDialog } from './connect-ends-dialog.js';
import { ConnectionsList } from './connections-list.js';
import { ConnectionsSelectionActions } from './connections-selection-actions.js';
import { ConnectionsToolbar } from './connections-toolbar.js';
import { GraphBody, TraceBody } from './connections-view-bodies.js';

import type { ReactElement } from 'react';

import type { ConnectionsPageActions } from './connections-page-actions.js';
import type { ConnectionsPageModel } from './connections-page-model.js';

interface ConnectionsPageViewProps {
  readonly model: ConnectionsPageModel;
  readonly actions: ConnectionsPageActions;
}

function ConnectButton({ online, onOpen }: { online: boolean; onOpen: () => void }): ReactElement {
  return (
    <HintTooltip label="Connect two things" disabledReason={!online ? OFFLINE_REASON : undefined}>
      <Button
        aria-disabled={!online || undefined}
        disabled={!online}
        onClick={online ? onOpen : undefined}
        prefix={<Plus className="size-4" aria-hidden />}
      >
        Connect
      </Button>
    </HintTooltip>
  );
}

function ConnectionsTabs(): ReactElement {
  const navigate = useNavigate();
  return (
    <Tabs
      value="connections"
      onValueChange={(value) => {
        if (value === 'fixtures') void navigate('/inventory/connections/fixtures');
      }}
    >
      <TabsList aria-label="Connections and fixtures">
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function RegistryBody({ model, actions }: ConnectionsPageViewProps): ReactElement {
  if (model.initialLoading) return <ListSkeleton label="Loading connections" />;
  if (model.readError) return <ListError noun="connections" onRetry={model.retry} />;

  return (
    <>
      <ConnectionsToolbar
        query={model.queryDraft}
        kind={model.kindDraft}
        view={model.url.view}
        summary={model.registry.summary}
        total={model.total}
        narrowed={model.narrowed}
        onQueryChange={model.setQueryDraft}
        onKindChange={model.setKindDraft}
        onViewChange={model.setView}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {model.url.view === 'graph' ? (
            <GraphBody model={model} focusItemId={model.url.trace} />
          ) : (
            <ConnectionsList
              rows={model.resolvedRows}
              world={model.world}
              selection={model.selection}
              traceItemId={model.url.trace}
              online={model.online}
              hasNextPage={model.registry.hasNextPage}
              onLoadMore={model.registry.fetchNextPage}
              onOpen={actions.onOpen}
              onTrace={actions.onTrace}
              onDisconnect={(row) => actions.disconnectRows([row])}
              onClearFilters={model.clearFilters}
              onRetry={model.retry}
              loading={model.registryFiltering}
              error={false}
              narrowed={model.narrowed}
              disconnectingIds={actions.disconnectingIds}
            />
          )}
        </div>
        <TraceBody
          model={model}
          onClose={actions.onCloseTrace}
          onOpenItem={actions.onOpenTraceItem}
        />
      </div>
    </>
  );
}

/** Renders the Connections page shell and its current presentation. */
export function ConnectionsPageView({ model, actions }: ConnectionsPageViewProps): ReactElement {
  const [connectOpen, setConnectOpen] = useState(false);
  const staleBanner = model.changed.stale ? (
    <StateBanner
      kind="stale"
      title="Connections changed elsewhere since this page loaded"
      detail="The registry stays as it is while you select. Reload to see the changes."
      actionLabel="Reload"
      onAction={() => void model.changed.reload()}
    />
  ) : null;

  return (
    <InventoryPage
      title="Connections"
      icon={Cable}
      description="What plugs into, feeds or pairs with what, across the house."
      actions={<ConnectButton online={model.online} onOpen={() => setConnectOpen(true)} />}
      tabs={<ConnectionsTabs />}
      banner={!model.online ? <OfflineBanner /> : staleBanner}
      bodyClassName="gap-3"
      dock={
        <ConnectionsSelectionActions
          model={model}
          online={model.online}
          onDisconnect={() => actions.disconnectRows(actions.selectedRows)}
          onTrace={actions.onTraceSelection}
          onLabels={actions.onLabels}
        />
      }
    >
      <RegistryBody model={model} actions={actions} />
      {connectOpen ? <ConnectEndsDialog open onOpenChange={setConnectOpen} /> : null}
    </InventoryPage>
  );
}
