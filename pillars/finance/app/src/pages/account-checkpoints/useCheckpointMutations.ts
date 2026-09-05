import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ALL_ACCOUNTS_KEY } from '../../components/accounts/hooks/useAllAccounts';
import { unwrap } from '../../finance-api-helpers.js';
import { checkpointsCreate, checkpointsRemove } from '../../finance-api/index.js';
import { ACCOUNTS_KEY } from '../accounts/useAccountMutations';
import { accountBalanceHistoryKey, accountBalanceKey, accountCheckpointsKey } from './queryKeys';

import type { CheckpointsCreateData } from '../../finance-api/types.gen.js';

type CreateBody = NonNullable<CheckpointsCreateData['body']>;

/**
 * Create/delete for one account's checkpoints (POPS-2888). Both mutations
 * invalidate the same set of keys: this page's own list, the balance and
 * balance-history queries POPS-2887's real balance card reads, and the
 * accounts list/grid — so the badge and any subtotal elsewhere move without
 * a reload. A 409 deleting an `import`/`statement` row, or a 422 on a
 * future date or an archived account, surfaces as the server's own message
 * via `unwrap`'s thrown error rather than a client-guessed one.
 */
export function useCheckpointMutations(accountId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accountCheckpointsKey(accountId) }),
      queryClient.invalidateQueries({ queryKey: accountBalanceKey(accountId) }),
      queryClient.invalidateQueries({ queryKey: accountBalanceHistoryKey(accountId) }),
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ALL_ACCOUNTS_KEY }),
    ]);

  const createMutation = useMutation({
    mutationFn: async (body: CreateBody) =>
      unwrap(await checkpointsCreate({ path: { id: accountId }, body })),
    onSuccess: () => toast.success('Checkpoint added'),
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (checkpointId: string) =>
      unwrap(await checkpointsRemove({ path: { id: accountId, checkpointId } })),
    onSuccess: () => toast.success('Checkpoint deleted'),
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  return { createMutation, deleteMutation };
}
