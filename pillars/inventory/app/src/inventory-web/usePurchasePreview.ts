import { useQuery } from '@tanstack/react-query';

import { PurchasesApiError, unwrap } from '../purchases-api-helpers.js';
import { purchaseGet } from '../purchases-api/index.js';
import { toPurchaseResult } from './purchase-model.js';

import type { PurchaseGetResponse } from '../purchases-api/types.gen.js';
import type { PurchaseResult } from './purchase-model.js';

/** The query key for one read-only purchase preview. */
export function purchasePreviewQueryKey(
  id: string
): readonly ['inventory', 'purchases', 'purchase', string] {
  return ['inventory', 'purchases', 'purchase', id] as const;
}

/** The state returned by {@link usePurchasePreview}. */
export interface PurchasePreviewState {
  purchase: PurchaseResult | null;
  status: 'idle' | 'pending' | 'error' | 'success';
  error: PurchasesApiError | null;
}

/** Read one purchase from the purchases pillar for an inventory preview. */
export function usePurchasePreview(id: string | null): PurchasePreviewState {
  const activeId = id ?? '';
  const query = useQuery<PurchaseGetResponse, PurchasesApiError>({
    queryKey: purchasePreviewQueryKey(activeId),
    queryFn: async () => unwrap(await purchaseGet({ path: { id: activeId } })),
    enabled: activeId.length > 0,
  });

  return {
    purchase: query.data === undefined ? null : toPurchaseResult(query.data),
    status: activeId.length === 0 ? 'idle' : query.status,
    error: query.error instanceof PurchasesApiError ? query.error : null,
  };
}
