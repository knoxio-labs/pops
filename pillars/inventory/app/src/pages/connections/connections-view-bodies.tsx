import { Cable } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { ConnectionGraph } from './connection-graph.js';
import { ConnectionTracePanel } from './connection-trace-panel.js';

import type { ReactElement } from 'react';

import type { ConnectionsPageModel } from './connections-page-model.js';

function LoadingGraph(): ReactElement {
  return <Skeleton className="h-full min-h-80 w-full rounded-lg" aria-label="Loading graph" />;
}

/** Props for the graph presentation body. */
export interface GraphBodyProps {
  readonly model: ConnectionsPageModel;
  readonly focusItemId: string | null;
}

/** Renders graph loading, error, empty, and all-connections states. */
export function GraphBody({ model, focusItemId }: GraphBodyProps): ReactElement {
  if (model.allConnections.status === 'pending') return <LoadingGraph />;
  if (model.allConnections.status === 'error') {
    return (
      <EmptyState
        title="Connection graph did not load"
        description="The inventory service did not answer. Nothing was changed."
        action={
          <Button variant="outline" onClick={model.retry}>
            Retry
          </Button>
        }
      />
    );
  }
  if (model.resolvedAllRows.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title="Nothing is connected yet"
        description="The graph will appear when the registry has connections."
      />
    );
  }
  return <ConnectionGraph rows={model.resolvedAllRows} focusItemId={focusItemId} />;
}

/** Props for the trace presentation body. */
export interface TraceBodyProps {
  readonly model: ConnectionsPageModel;
  readonly onClose: () => void;
  readonly onOpenItem: (id: string) => void;
}

/** Renders the breadth-first trace pane or its loading/unavailable states. */
export function TraceBody({ model, onClose, onOpenItem }: TraceBodyProps): ReactElement | null {
  if (model.initialLoading || model.readError) return null;
  if (model.url.trace === null) return null;
  if (model.allConnections.status === 'pending') {
    return (
      <aside aria-label="Loading connection trace" className="w-full shrink-0 lg:w-80">
        <Skeleton className="h-80 w-full rounded-lg" />
      </aside>
    );
  }
  if (model.allConnections.status === 'error') {
    return (
      <aside className="flex w-full shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 lg:w-80">
        <h2 className="text-sm font-semibold">Connection trace did not load</h2>
        <p className="text-sm text-muted-foreground">
          The inventory service did not answer. Nothing was changed.
        </p>
        <Button variant="outline" size="sm" onClick={model.retry}>
          Retry
        </Button>
      </aside>
    );
  }
  if (model.trace === null) return null;
  return <ConnectionTracePanel trace={model.trace} onClose={onClose} onOpenItem={onOpenItem} />;
}
