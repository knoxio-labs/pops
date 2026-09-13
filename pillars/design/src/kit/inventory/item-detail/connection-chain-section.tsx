import {
  ConnectionGraph,
  type ConnectionGraphStatus,
} from '@/kit/inventory/connections/connection-graph';
import {
  ConnectionTracePanel,
  type ConnectionTracePanelStatus,
} from '@/kit/inventory/connections/connection-trace-panel';
import { GitBranch, Network } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import type { GraphData, TraceNode } from '@/kit/inventory/connections/types';

export function ConnectionChainSection({
  itemId,
  graphStatus,
  graphData,
  traceStatus,
  traceTree,
  onNavigate,
  initialShowGraph = false,
}: {
  itemId: string;
  graphStatus: ConnectionGraphStatus;
  graphData: GraphData | null;
  traceStatus: ConnectionTracePanelStatus;
  traceTree: TraceNode | null;
  onNavigate: (itemId: string) => void;
  initialShowGraph?: boolean;
}) {
  const [showGraph, setShowGraph] = useState(initialShowGraph);
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Connection Chain
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowGraph((v) => !v)}>
          <Network className="h-4 w-4 mr-1.5" />
          {showGraph ? 'Hide Graph' : 'View Graph'}
        </Button>
      </div>
      {showGraph ? (
        <ConnectionGraph
          itemId={itemId}
          status={graphStatus}
          data={graphData}
          onNavigate={onNavigate}
        />
      ) : (
        <ConnectionTracePanel
          itemId={itemId}
          status={traceStatus}
          tree={traceTree}
          onNavigate={onNavigate}
        />
      )}
    </section>
  );
}
