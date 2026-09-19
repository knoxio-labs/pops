/**
 * A React Query mutation over {@link sendInventoryMutation}: issues one
 * inventory command and invalidates the web item-list and item-detail
 * queries once the server has answered, whatever the outcome's `status` --
 * a `conflict` or `rejected` batch still means the item may have changed
 * underneath the caller (another actor's write raced it), so the cached page
 * is no longer trustworthy either way.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendInventoryMutation, type InventoryCommandInput } from './mutation-client.js';
import { WEB_ITEMS_QUERY_KEY, webItemDetailQueryKey } from './queryKeys.js';

/**
 * `useMutation` over one inventory command. `mutate`/`mutateAsync` take an
 * {@link InventoryCommandInput}; the resolved value is the outcome the server
 * returned (`applied`, `conflict`, `rejected` or `deferred`) -- callers switch
 * on `outcome.status`, they do not catch it as an error.
 */
export function useInventoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InventoryCommandInput) => sendInventoryMutation(input),
    onSettled: (_outcome, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: webItemDetailQueryKey(input.entityId) });
    },
  });
}
