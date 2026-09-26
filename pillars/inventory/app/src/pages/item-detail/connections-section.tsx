import { GitBranch, Link2, Network } from 'lucide-react';
import { useState } from 'react';

import { Button, Skeleton } from '@pops/ui';

import { ConnectDialog } from '../../components/ConnectDialog';
import { ConnectionGraph } from '../../components/ConnectionGraph';
import { ConnectionTracePanel } from '../../components/ConnectionTracePanel';
import { ConnectionRow } from './connection-row';

import type { ItemConnection } from '../../foundation/item-page';

function ConnectionsList({
  connections,
  isLoading,
  itemId,
  readOnly,
  isDisconnecting,
  onDisconnect,
}: {
  connections: readonly ItemConnection[];
  isLoading: boolean;
  itemId: string;
  readOnly: boolean;
  isDisconnecting: boolean;
  onDisconnect: (connection: ItemConnection) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (connections.length === 0) {
    return <p className="text-sm text-muted-foreground">No connected items yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {connections.map((connection) => (
        <ConnectionRow
          key={connection.id}
          connection={connection}
          itemId={itemId}
          readOnly={readOnly}
          isDisconnecting={isDisconnecting}
          onDisconnect={() => onDisconnect(connection)}
        />
      ))}
    </ul>
  );
}

function ConnectionChain({
  itemId,
  showGraph,
  onToggle,
}: {
  itemId: string;
  showGraph: boolean;
  onToggle: () => void;
}) {
  return (
    <section aria-label="Connection Chain">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="size-4" aria-hidden />
          Connection Chain
        </h2>
        <Button variant="outline" size="sm" onClick={onToggle}>
          <Network className="mr-1.5 size-4" aria-hidden />
          {showGraph ? 'Hide Graph' : 'View Graph'}
        </Button>
      </div>
      {showGraph ? <ConnectionGraph itemId={itemId} /> : <ConnectionTracePanel itemId={itemId} />}
    </section>
  );
}

/** Renders the direct connections list and the existing graph/trace bridge. */
export function ConnectionsSection({
  itemId,
  connections,
  isLoading,
  isDisconnecting,
  readOnly,
  onConnected,
  onDisconnect,
}: {
  itemId: string;
  connections: readonly ItemConnection[];
  isLoading: boolean;
  isDisconnecting: boolean;
  readOnly: boolean;
  onConnected: () => void;
  onDisconnect: (connection: ItemConnection) => void;
}) {
  const [showGraph, setShowGraph] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Connected Items">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4" aria-hidden />
            Connected Items
          </h2>
          <ConnectDialog
            currentItemId={itemId}
            onConnected={onConnected}
            disabledReason={readOnly ? 'Nothing can change on this item.' : undefined}
          />
        </div>
        <ConnectionsList
          connections={connections}
          isLoading={isLoading}
          itemId={itemId}
          readOnly={readOnly}
          isDisconnecting={isDisconnecting}
          onDisconnect={onDisconnect}
        />
      </section>
      {connections.length > 0 ? (
        <ConnectionChain
          itemId={itemId}
          showGraph={showGraph}
          onToggle={() => setShowGraph((current) => !current)}
        />
      ) : null}
    </div>
  );
}
