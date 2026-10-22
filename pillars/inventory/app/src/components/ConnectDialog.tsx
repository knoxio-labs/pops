import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, SearchPickerDialog, toastError } from '@pops/ui';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { connectionsConnect } from '../inventory-api/index.js';
import { ItemSearchResultRow, useItemSearch, type SearchableItem } from './ItemSearchResult.js';

import type { ReactElement } from 'react';

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

  const { isLoading, results } = useItemSearch(open, search, currentItemId);

  const connectMutation = useConnectMutation(() => {
    toast.success('Items connected');
    onConnected();
    setOpen(false);
    setSearch('');
  });

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
      getResultKey={(item: SearchableItem) => item.id}
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      renderResult={(item: SearchableItem) => (
        <ItemSearchResultRow
          item={item}
          icon={Link2}
          disabled={connectMutation.isPending}
          onPick={(itemBId) => connectMutation.mutate({ itemAId: currentItemId, itemBId })}
        />
      )}
    />
  );
}
