import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AssetIdBadge, Button, SearchPickerDialog, toastError, TypeBadge } from '@pops/ui';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { connectionsConnect, itemsList } from '../inventory-api/index.js';

import type { ReactElement } from 'react';

import type { ItemsListResponse } from '../inventory-api/index.js';

type InventoryItem = ItemsListResponse['data'][number];

type ConnectInput = { itemAId: string; itemBId: string };

function connectError(error: Error): InventoryApiError {
  const apiError =
    error instanceof InventoryApiError
      ? error
      : new InventoryApiError({
          code: 'web.client.unknown',
          kind: 'client',
          message: 'Failed to connect items',
          retryable: false,
        });
  if (apiError.status !== 409) return apiError;
  return new InventoryApiError({
    code: apiError.code,
    details: apiError.details,
    kind: apiError.kind,
    message: 'These items are already connected',
    requestId: apiError.requestId,
    retryable: apiError.retryable,
    status: apiError.status,
  });
}

interface ConnectDialogProps {
  currentItemId: string;
  onConnected: () => void;
  trigger?: ReactElement;
  /** Explains why connecting is unavailable and disables the trigger. */
  disabledReason?: string;
}

interface ConnectResultRowProps {
  item: InventoryItem;
  disabled: boolean;
  onConnect: (itemId: string) => void;
}

function ConnectResultRow({ item, disabled, onConnect }: ConnectResultRowProps) {
  const hasMeta = ((item.brand ?? item.model) || item.assetId) ?? item.type;
  return (
    <Button
      variant="ghost"
      className="w-full flex items-center justify-between p-2.5 h-auto text-left"
      onClick={() => onConnect(item.id)}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.itemName}</div>
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {(item.brand ?? item.model) && (
              <span className="text-xs text-muted-foreground">
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </span>
            )}
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground mt-0.5">No details</span>
        )}
      </div>
      <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Button>
  );
}

function useConnectMutation(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorHandled: true },
    mutationFn: async (input: ConnectInput) =>
      unwrap(
        await connectionsConnect({ body: { itemAId: input.itemAId, itemBId: input.itemBId } })
      ),
    onSuccess,
    onError: (error: Error) => toastError(connectError(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'connections'] }),
  });
}

function defaultTrigger(disabledReason: string | undefined): ReactElement {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabledReason !== undefined}
      title={disabledReason}
      aria-label={disabledReason ? `Connect Item (${disabledReason})` : 'Connect Item'}
    >
      <Link2 className="h-4 w-4 mr-1.5" />
      Connect Item
    </Button>
  );
}

/** Searches inventory items and connects the selected result to the current item. */
export function ConnectDialog({
  currentItemId,
  onConnected,
  trigger,
  disabledReason,
}: ConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const listInput = { search, limit: 10 };
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', listInput],
    queryFn: async () => unwrap(await itemsList({ query: listInput })),
    enabled: open && search.length >= 2,
  });

  const connectMutation = useConnectMutation(() => {
    toast.success('Items connected');
    onConnected();
    setOpen(false);
    setSearch('');
  });

  const results = data?.data.filter((item: InventoryItem) => item.id !== currentItemId) ?? [];

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch('');
      }}
      trigger={trigger ?? defaultTrigger(disabledReason)}
      title="Connect Item"
      description="Search for an item to connect by name or asset ID."
      searchPlaceholder="Search items..."
      emptyMessage="No items found"
      getResultKey={(item: InventoryItem) => item.id}
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      renderResult={(item: InventoryItem) => (
        <ConnectResultRow
          item={item}
          disabled={connectMutation.isPending}
          onConnect={(itemBId) => connectMutation.mutate({ itemAId: currentItemId, itemBId })}
        />
      )}
    />
  );
}
