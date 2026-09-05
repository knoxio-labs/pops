import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAllAccounts } from '../../components/accounts/hooks/useAllAccounts';
import { useAllEntities } from '../../lib/useAllEntities';
import {
  DEFAULT_TRANSACTION_VALUES,
  TransactionFormSchema,
  type TransactionFormValues,
} from '../transactions/types';
import { useTransactionMutations } from '../transactions/useTransactionMutations';
import { buildTransactionPayload } from '../transactions/useTransactionsPage';

/**
 * The account dashboard's "Add transaction" action: the same
 * `TransactionFormDialog` and create mutation the transactions page uses
 * (`useTransactionMutations`), pointed at a form that opens pre-scoped to
 * this account rather than the transactions page's own dialog state — the
 * two never need to be open at once, so there is nothing to share beyond the
 * mutation and the form schema.
 */
export function useAddTransactionDialog(accountId: string) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const entitiesQuery = useAllEntities();
  const accountsQuery = useAllAccounts();

  const form = useForm({
    resolver: standardSchemaResolver(TransactionFormSchema),
    defaultValues: DEFAULT_TRANSACTION_VALUES,
  });

  const noop = () => {
    /* only create is wired here; update/delete never fire from this dialog */
  };
  const { createMutation } = useTransactionMutations({
    setIsDialogOpen,
    setEditingTransaction: noop,
    setDeletingTx: noop,
  });

  const openDialog = () => {
    form.reset({
      ...DEFAULT_TRANSACTION_VALUES,
      accountId,
      date: new Date().toISOString().slice(0, 10),
    });
    setIsDialogOpen(true);
  };

  const resolveEntityName = (entityId: string): string | null =>
    entitiesQuery.data?.data.find((entity) => entity.id === entityId)?.name ?? null;

  const onSubmit = (values: TransactionFormValues) => {
    const entityName = values.entityId === '' ? null : resolveEntityName(values.entityId);
    createMutation.mutate(buildTransactionPayload({ values, entityName }));
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    openDialog,
    form,
    onSubmit,
    isSubmitting: createMutation.isPending,
    entities: entitiesQuery.data?.data ?? [],
    accounts: accountsQuery.accounts ?? [],
  };
}
