import { ConnectDialog, type ConnectDialogProps } from '@/kit/inventory/connections/connect-dialog';
import { type ConnectionGraphStatus } from '@/kit/inventory/connections/connection-graph';
import { type ConnectionTracePanelStatus } from '@/kit/inventory/connections/connection-trace-panel';
import { Link2 } from 'lucide-react';

import {
  ConnectedItemsList,
  type ConnectedItemSummary,
  type ItemConnection,
} from './connected-items-list';
import { ConnectionChainSection } from './connection-chain-section';

import type { GraphData, TraceNode } from '@/kit/inventory/connections/types';

export { type ConnectedItemSummary, type ItemConnection } from './connected-items-list';

export interface ConnectionsSectionProps {
  itemId: string;
  connections: ItemConnection[];
  connectionsLoading: boolean;
  summaries: Record<string, ConnectedItemSummary>;
  isDisconnecting: boolean;
  onDisconnect: (conn: ItemConnection) => void;
  onNavigate?: (itemId: string) => void;
  connectDialog: Omit<ConnectDialogProps, 'currentItemId'>;
  graphStatus: ConnectionGraphStatus;
  graphData: GraphData | null;
  traceStatus: ConnectionTracePanelStatus;
  traceTree: TraceNode | null;
  initialShowGraph?: boolean;
}

export function ConnectionsSection({
  itemId,
  connections,
  connectionsLoading,
  summaries,
  isDisconnecting,
  onDisconnect,
  onNavigate = () => {},
  connectDialog,
  graphStatus,
  graphData,
  traceStatus,
  traceTree,
  initialShowGraph = false,
}: ConnectionsSectionProps) {
  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connected Items
          </h2>
          <ConnectDialog currentItemId={itemId} {...connectDialog} />
        </div>
        <ConnectedItemsList
          itemId={itemId}
          connections={connections}
          connectionsLoading={connectionsLoading}
          summaries={summaries}
          onNavigate={onNavigate}
          isDisconnecting={isDisconnecting}
          onDisconnect={onDisconnect}
        />
      </section>
      {connections.length ? (
        <ConnectionChainSection
          itemId={itemId}
          graphStatus={graphStatus}
          graphData={graphData}
          traceStatus={traceStatus}
          traceTree={traceTree}
          onNavigate={onNavigate}
          initialShowGraph={initialShowGraph}
        />
      ) : null}
    </>
  );
}
