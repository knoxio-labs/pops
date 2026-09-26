import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { useSetPageContext } from '@pops/navigation';

import { unwrap } from '../../inventory-api-helpers.js';
import * as inventoryApi from '../../inventory-api/index.js';
import { webItemDetailQueryKey } from '../../inventory-web/queryKeys.js';
import { useItemDetailQueries } from './item-detail-queries';

const { connectionsDisconnect, itemsDelete, photosReorder } = inventoryApi;

interface DeleteItemInput {
  id: string;
}

interface DisconnectInput {
  itemAId: string;
  itemBId: string;
}

interface ReorderPhotosInput {
  itemId: string;
  orderedIds: number[];
}

function useItemDetailMutations(id: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteItemInput) =>
      unwrap(await itemsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Item deleted');
      void navigate('/inventory/items');
    },
    onError: (err: Error) => toast.error(`Failed to delete: ${err.message}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      if (id) void queryClient.invalidateQueries({ queryKey: webItemDetailQueryKey(id) });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (input: DisconnectInput) =>
      unwrap(
        await connectionsDisconnect({
          query: { itemAId: input.itemAId, itemBId: input.itemBId },
        })
      ),
    onSuccess: () => {
      toast.success('Items disconnected');
    },
    onError: (err: Error) => toast.error(`Failed to disconnect: ${err.message}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'connections'] });
      if (id) void queryClient.invalidateQueries({ queryKey: webItemDetailQueryKey(id) });
    },
  });

  const reorderPhotosMutation = useMutation({
    mutationFn: async (input: ReorderPhotosInput) =>
      unwrap(
        await photosReorder({
          path: { itemId: input.itemId },
          body: { orderedIds: input.orderedIds },
        })
      ),
    onError: (err: Error) => toast.error(`Failed to reorder photos: ${err.message}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'photos'] });
      if (id) void queryClient.invalidateQueries({ queryKey: webItemDetailQueryKey(id) });
    },
  });

  return { deleteMutation, disconnectMutation, reorderPhotosMutation };
}

type ItemDetailQueries = ReturnType<typeof useItemDetailQueries>;

function itemReadState({
  legacyItem,
  legacyQuery,
  webQuery,
}: Pick<ItemDetailQueries, 'legacyItem' | 'legacyQuery' | 'webQuery'>) {
  return {
    itemData: legacyItem ? { data: legacyItem } : undefined,
    history: webQuery.data?.history.events ?? [],
    isLoading: !legacyItem && (legacyQuery.isLoading || webQuery.isLoading),
    error: legacyItem ? undefined : (legacyQuery.error ?? webQuery.error),
  };
}

/** Reads the compatible legacy/detail endpoints and exposes item-page mutations. */
export function useItemDetailPageModel() {
  const { id } = useParams<{ id: string }>();
  const { legacyQuery, webQuery, legacyItem, locationQuery, connectionsQuery, photosQuery } =
    useItemDetailQueries(id);
  const { deleteMutation, disconnectMutation, reorderPhotosMutation } = useItemDetailMutations(id);

  const itemEntity = useMemo(
    () => ({
      uri: `pops:inventory/item/${id ?? ''}`,
      type: 'item' as const,
      title: legacyItem?.itemName ?? webQuery.data?.item.name ?? '',
    }),
    [id, legacyItem?.itemName, webQuery.data?.item.name]
  );
  useSetPageContext({ page: 'item-detail', pageType: 'drill-down', entity: itemEntity });
  const readState = itemReadState({ legacyItem, legacyQuery, webQuery });

  return {
    id,
    item: legacyItem,
    ...readState,
    webItem: webQuery.data?.item,
    locationPath: locationQuery.data?.data ?? [],
    connectionsData: connectionsQuery.data,
    connectionsLoading: connectionsQuery.isLoading,
    photosData: photosQuery.data,
    photosLoading: photosQuery.isLoading,
    reorderPhotosMutation,
    deleteMutation,
    disconnectMutation,
    refetch: async () => {
      await Promise.all([legacyQuery.refetch(), webQuery.refetch()]);
    },
  };
}
