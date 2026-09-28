import { useMutation } from '@tanstack/react-query';
import { Cable, Link2, Unlink } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { ConnectDialog } from '../../components/ConnectDialog';
import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { RowVerb } from '../../foundation/rows/item-row';
import { unwrap } from '../../inventory-api-helpers.js';
import { connectionsDisconnect, fixturesDisconnect } from '../../inventory-api/index.js';

import type { ReactElement } from 'react';

import type { DetailConnection, ItemDetailModel } from './detail-model';

function connectionLabel(connection: DetailConnection): ReactElement {
  if (connection.target === 'item') {
    return (
      <Link
        to={`/inventory/items/${connection.farId}`}
        className="min-w-0 truncate text-sm font-medium hover:underline"
      >
        {connection.name}
      </Link>
    );
  }
  return <span className="min-w-0 truncate text-sm font-medium">{connection.name}</span>;
}

function ConnectionRow({
  connection,
  disabledReason,
  onDisconnect,
}: {
  connection: DetailConnection;
  disabledReason: string | undefined;
  onDisconnect: () => void;
}): ReactElement {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      {connection.target === 'fixture' ? (
        <Cable className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        {connectionLabel(connection)}
        <span className="truncate text-xs text-muted-foreground">
          {connection.relation} · {connection.where}
        </span>
      </span>
      <RowVerb
        icon={Unlink}
        label="Disconnect"
        disabledReason={disabledReason}
        onClick={onDisconnect}
      />
    </li>
  );
}

function useDisconnectMutation(itemId: string, onLinksChanged: () => void) {
  return useMutation({
    mutationFn: async (connection: DetailConnection) => {
      if (connection.target === 'item') {
        return unwrap(
          await connectionsDisconnect({
            query: { itemAId: itemId, itemBId: connection.farId },
          })
        );
      }
      return unwrap(
        await fixturesDisconnect({
          path: { itemId, fixtureId: connection.farId },
        })
      );
    },
    onSuccess: () => {
      toast.success('Connection removed');
      onLinksChanged();
    },
    onError: (error: Error) => toast.error(`Failed to disconnect: ${error.message}`),
  });
}

function ConnectAction({
  itemId,
  disabledReason,
  onLinksChanged,
}: {
  itemId: string;
  disabledReason: string | undefined;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <ConnectDialog
      currentItemId={itemId}
      onConnected={onLinksChanged}
      disabledReason={disabledReason}
      trigger={
        <VerbButton
          label="Connect"
          icon={Link2}
          disabledReason={disabledReason}
          variant="outline"
        />
      }
    />
  );
}

function ConnectionList({
  connections,
  disabledReason,
  isDisconnecting,
  onDisconnect,
}: {
  connections: readonly DetailConnection[];
  disabledReason: string | undefined;
  isDisconnecting: boolean;
  onDisconnect: (connection: DetailConnection) => void;
}): ReactElement {
  return (
    <ul aria-label="Connections" className="divide-y divide-border/60">
      {connections.map((connection) => (
        <ConnectionRow
          key={connection.id}
          connection={connection}
          disabledReason={disabledReason ?? (isDisconnecting ? 'Removing connection.' : undefined)}
          onDisconnect={() => onDisconnect(connection)}
        />
      ))}
    </ul>
  );
}

function ConnectionContent({
  connections,
  connectAction,
  disabledReason,
  isDisconnecting,
  onDisconnect,
}: {
  connections: readonly DetailConnection[] | null;
  connectAction: ReactElement;
  disabledReason: string | undefined;
  isDisconnecting: boolean;
  onDisconnect: (connection: DetailConnection) => void;
}): ReactElement {
  if (connections === null) return <EmptyLine icon={Link2} text="Connections are loading." />;
  if (connections.length === 0) {
    return <EmptyLine icon={Link2} text="Not connected to anything." action={connectAction} />;
  }
  return (
    <ConnectionList
      connections={connections}
      disabledReason={disabledReason}
      isDisconnecting={isDisconnecting}
      onDisconnect={onDisconnect}
    />
  );
}

/** Renders item and fixture connections with read-only-safe disconnect actions. */
export function ConnectionsSection({
  itemId,
  model,
  readOnly,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  readOnly: boolean;
  onLinksChanged: () => void;
}): ReactElement {
  const disconnectMutation = useDisconnectMutation(itemId, onLinksChanged);
  const disabledReason = readOnly ? 'Nothing can change on this item.' : undefined;
  const connectAction = (
    <ConnectAction
      itemId={itemId}
      disabledReason={disabledReason}
      onLinksChanged={onLinksChanged}
    />
  );

  return (
    <section aria-label="Connections" className="flex flex-col gap-3">
      <PaneLabel trailing={connectAction}>Connections</PaneLabel>
      <ConnectionContent
        connections={model.connections}
        connectAction={connectAction}
        disabledReason={disabledReason}
        isDisconnecting={disconnectMutation.isPending}
        onDisconnect={disconnectMutation.mutate}
      />
    </section>
  );
}
