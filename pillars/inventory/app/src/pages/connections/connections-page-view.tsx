import { Cable } from 'lucide-react';

import { StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
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

function RegistryBody({ model, actions }: ConnectionsPageViewProps): ReactElement {
  return (
    <>
      <ConnectionsToolbar
        query={model.queryDraft}
        kind={model.kindDraft}
        view={model.url.view}
        summary={model.registry.summary}
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
              rows={model.registry.rows}
              world={model.placement.world}
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
              loading={model.registry.status === 'pending'}
              error={model.registry.status === 'error'}
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
      description="What plugs into, feeds or pairs with what."
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
    </InventoryPage>
  );
}
