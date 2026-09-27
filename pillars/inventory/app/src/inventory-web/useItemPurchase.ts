import { useQuery } from '@tanstack/react-query';

import { PurchasesApiError, unwrap } from '../purchases-api-helpers.js';
import { purchaseList } from '../purchases-api/index.js';

import type { PurchaseListResponse } from '../purchases-api/types.gen.js';

/** The purchase provenance returned for one inventory item. */
export interface ItemPurchase {
  id: string;
  merchant: string;
  orderedAt: string;
}

/** Builds the cache key for the purchase linked to one inventory item. */
export function itemPurchaseQueryKey(
  itemId: string
): readonly ['inventory', 'purchases', 'item', string] {
  return ['inventory', 'purchases', 'item', itemId] as const;
}

/** The state returned by {@link useItemPurchase}. */
export interface ItemPurchaseState {
  purchase: ItemPurchase | null;
  status: 'idle' | 'pending' | 'error' | 'success';
  error: PurchasesApiError | null;
}

function toItemPurchase(response: PurchaseListResponse): ItemPurchase | null {
  const purchase = response.items[0];
  if (purchase === undefined) return null;

  return {
    id: purchase.id,
    merchant: purchase.merchantEntityName ?? purchase.source,
    orderedAt: purchase.orderedAt,
  };
}

/** Reads the newest purchase whose item units reference the inventory item. */
export function useItemPurchase(itemId: string | null): ItemPurchaseState {
  const activeId = itemId ?? '';
  const query = useQuery<ItemPurchase | null, PurchasesApiError>({
    queryKey: itemPurchaseQueryKey(activeId),
    queryFn: async () =>
      toItemPurchase(
        unwrap(
          await purchaseList({
            query: { inventoryItemUri: `pops://inventory/item/${activeId}` },
          })
        )
      ),
    enabled: activeId.length > 0,
  });

  return {
    purchase: query.data ?? null,
    status: activeId.length === 0 ? 'idle' : query.status,
    error: query.error instanceof PurchasesApiError ? query.error : null,
  };
}
