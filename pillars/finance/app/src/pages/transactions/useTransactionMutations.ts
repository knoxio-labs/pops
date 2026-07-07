import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import {
  transactionsCreate,
  transactionsDelete,
  transactionsRestore,
  transactionsUnlinkTransfer,
  transactionsUpdate,
} from '../../finance-api/index.js';
import { type Transaction } from './types';

import type {
  TransactionsCreateData,
  TransactionsDeleteResponses,
  TransactionsUpdateData,
} from '../../finance-api/types.gen.js';

type CreateInput = NonNullable<TransactionsCreateData['body']>;
type UpdateData = NonNullable<TransactionsUpdateData['body']>;
type TransactionSnapshot = TransactionsDeleteResponses[200]['snapshot'];

export interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingTransaction: (t: Transaction | null) => void;
  setDeletingTx: (t: Transaction | null) => void;
}

interface UpdateInput {
  id: string;
  data: UpdateData;
}
interface DeleteInput {
  id: string;
}

function useCreateUpdateMutations(deps: MutationDeps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });

  const createMutation = useMutation({
    mutationFn: async (input: CreateInput) => unwrap(await transactionsCreate({ body: input })),
    onSuccess: () => {
      toast.success('Transaction created');
      deps.setIsDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInput) =>
      unwrap(await transactionsUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Transaction updated');
      deps.setIsDialogOpen(false);
      deps.setEditingTransaction(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  return { createMutation, updateMutation };
}

function useRestoreDeleteMutations(deps: MutationDeps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });

  const restoreMutation = useMutation({
    mutationFn: async (snapshot: TransactionSnapshot) =>
      unwrap(await transactionsRestore({ body: snapshot })),
    onSuccess: () => {
      toast.success('Transaction restored');
    },
    onError: (err: Error) => toast.error(`Failed to restore transaction: ${err.message}`),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteInput) =>
      unwrap(await transactionsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      deps.setDeletingTx(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const unlinkMutation = useMutation({
    mutationFn: async (input: DeleteInput) =>
      unwrap(await transactionsUnlinkTransfer({ path: { id: input.id } })),
    onSuccess: () => toast.success('Transfer unlinked'),
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  return { restoreMutation, deleteMutation, unlinkMutation };
}

export function useTransactionMutations(deps: MutationDeps) {
  const { createMutation, updateMutation } = useCreateUpdateMutations(deps);
  const { restoreMutation, deleteMutation, unlinkMutation } = useRestoreDeleteMutations(deps);

  /**
   * Confirm a delete: hard-delete on the server, capture the full snapshot
   * from the response, and surface a toast with an Undo action that calls
   * `restore` with that snapshot.
   */
  const confirmDelete = (tx: Transaction): void => {
    deleteMutation.mutate(
      { id: tx.id },
      {
        onSuccess: (response) => {
          const { snapshot } = response;
          toast.success(`Deleted: ${tx.description}`, {
            action: {
              label: 'Undo',
              onClick: () => restoreMutation.mutate(snapshot),
            },
            duration: 6000,
          });
        },
      }
    );
  };

  /** Break a false-positive transfer pair; the server unlinks both legs. */
  const confirmUnlink = (tx: Transaction): void => {
    unlinkMutation.mutate({ id: tx.id });
  };

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    unlinkMutation,
    confirmDelete,
    confirmUnlink,
  };
}
