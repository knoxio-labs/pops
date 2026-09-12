import { Unlink } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AssetIdBadge,
  Button,
  Skeleton,
  TypeBadge,
} from '@pops/ui';

/** As `GET /items/{id}/connections` serves a row: a plain, undirected pairing. */
export interface ItemConnection {
  id: number;
  itemAId: string;
  itemBId: string;
  createdAt: string;
}

/** A connected item's own display fields, as `ConnectionRow`'s item fetch resolves them. */
export interface ConnectedItemSummary {
  itemName: string;
  brand: string | null;
  assetId: string | null;
  type: string | null;
}

function DisconnectButton({
  itemName,
  onDisconnect,
  isDisconnecting,
}: {
  itemName: string;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive shrink-0"
          disabled={isDisconnecting}
          title="Disconnect"
          aria-label="Disconnect"
        >
          <Unlink className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {itemName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the connection between these items.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConnectionRowBadges({ summary }: { summary: ConnectedItemSummary | undefined }) {
  if (!summary?.assetId && !summary?.type) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {summary?.assetId && <AssetIdBadge assetId={summary.assetId} />}
      {summary?.type && <TypeBadge type={summary.type} />}
    </div>
  );
}

function ConnectionRow({
  connectedItemId,
  summary,
  onNavigate,
  onDisconnect,
  isDisconnecting,
}: {
  connectedItemId: string;
  summary: ConnectedItemSummary | undefined;
  onNavigate: (itemId: string) => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const itemName = summary?.itemName ?? connectedItemId;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <a
        href={`/inventory/items/${connectedItemId}`}
        className="flex-1 min-w-0 hover:underline"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(connectedItemId);
        }}
      >
        <span className="font-medium">{itemName}</span>
        {summary?.brand && (
          <span className="text-muted-foreground text-sm ml-2">{summary.brand}</span>
        )}
        <ConnectionRowBadges summary={summary} />
      </a>
      <DisconnectButton
        itemName={itemName}
        onDisconnect={onDisconnect}
        isDisconnecting={isDisconnecting}
      />
    </div>
  );
}

export function ConnectedItemsList({
  itemId,
  connections,
  connectionsLoading,
  summaries,
  onNavigate,
  isDisconnecting,
  onDisconnect,
}: {
  itemId: string;
  connections: ItemConnection[];
  connectionsLoading: boolean;
  summaries: Record<string, ConnectedItemSummary>;
  onNavigate: (itemId: string) => void;
  isDisconnecting: boolean;
  onDisconnect: (conn: ItemConnection) => void;
}) {
  if (connectionsLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!connections.length) {
    return <p className="text-muted-foreground text-sm">No connected items yet.</p>;
  }
  return (
    <div className="space-y-2">
      {connections.map((conn) => (
        <ConnectionRow
          key={conn.id}
          connectedItemId={conn.itemAId === itemId ? conn.itemBId : conn.itemAId}
          summary={summaries[conn.itemAId === itemId ? conn.itemBId : conn.itemAId]}
          onNavigate={onNavigate}
          onDisconnect={() => onDisconnect(conn)}
          isDisconnecting={isDisconnecting}
        />
      ))}
    </div>
  );
}
