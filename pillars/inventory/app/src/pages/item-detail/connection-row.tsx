import { useQuery } from '@tanstack/react-query';
import { Unlink } from 'lucide-react';
import { Link } from 'react-router';

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
  TypeBadge,
} from '@pops/ui';

import { unwrap } from '../../inventory-api-helpers.js';
import { itemsGet } from '../../inventory-api/index.js';

import type { ItemConnection } from '../../foundation/item-page';
import type { ItemsGetResponses } from '../../inventory-api/types.gen.js';

type Item = ItemsGetResponses[200]['data'];

function connectedItemId(connection: ItemConnection, itemId: string): string {
  return connection.itemAId === itemId ? connection.itemBId : connection.itemAId;
}

function ConnectedItemDetails({ item }: { item: Item | undefined }) {
  if (item === undefined) return null;
  return (
    <>
      {item.brand ? <span className="ml-2 text-sm text-muted-foreground">{item.brand}</span> : null}
      {(item.assetId ?? item.type) ? (
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {item.assetId ? <AssetIdBadge assetId={item.assetId} /> : null}
          {item.type ? <TypeBadge type={item.type} /> : null}
        </span>
      ) : null}
    </>
  );
}

function DisconnectDialog({
  itemName,
  readOnly,
  isDisconnecting,
  onDisconnect,
}: {
  itemName: string;
  readOnly: boolean;
  isDisconnecting: boolean;
  onDisconnect: () => void;
}) {
  const disabledReason = 'Nothing can change on this item.';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={readOnly || isDisconnecting}
          title={readOnly ? disabledReason : 'Disconnect'}
          aria-label="Disconnect"
        >
          <Unlink className="size-4" aria-hidden />
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

/** Renders one connection and its disconnect confirmation action. */
export function ConnectionRow({
  connection,
  itemId,
  readOnly,
  isDisconnecting,
  onDisconnect,
}: {
  connection: ItemConnection;
  itemId: string;
  readOnly: boolean;
  isDisconnecting: boolean;
  onDisconnect: () => void;
}) {
  const connectedId = connectedItemId(connection, itemId);
  const { data } = useQuery({
    queryKey: ['inventory', 'items', 'get', { id: connectedId }],
    queryFn: async () => unwrap(await itemsGet({ path: { id: connectedId } })),
  });
  const item: Item | undefined = data?.data;
  const itemName = item?.itemName ?? connectedId;
  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2">
      <Link to={`/inventory/items/${connectedId}`} className="min-w-0 flex-1 hover:underline">
        <span className="font-medium">{itemName}</span>
        <ConnectedItemDetails item={item} />
      </Link>
      <DisconnectDialog
        itemName={itemName}
        readOnly={readOnly}
        isDisconnecting={isDisconnecting}
        onDisconnect={onDisconnect}
      />
    </li>
  );
}
