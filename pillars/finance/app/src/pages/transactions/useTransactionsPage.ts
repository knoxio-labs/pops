import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAllAccounts } from '../../components/accounts/hooks/useAllAccounts';
import { unwrap } from '../../finance-api-helpers.js';
import { transactionsAvailableTags, transactionsList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { useAllEntities } from '../../lib/useAllEntities';
import {
  DEFAULT_TRANSACTION_VALUES,
  type Transaction,
  type TransactionFormValues,
  TransactionFormSchema,
} from './types';
import { useTransactionMutations } from './useTransactionMutations';

/**
 * Build the API payload from the form values.
 *
 * - amount: parsed via Number() — schema already validates finiteness
 * - entityId: '' → null (free-form selection cleared)
 * - entityName: looked up from the entities list when an id is selected
 * - accountName: looked up from the accounts list for the account picked by
 *   `accountId` — the server still requires the display-name `account`
 *   field alongside the id
 * - notes: '' → null (server contract is `string | null`)
 */
export interface BuildPayloadArgs {
  values: TransactionFormValues;
  entityName: string | null;
  accountName: string;
}

export function buildTransactionPayload({ values, entityName, accountName }: BuildPayloadArgs) {
  const entityId = values.entityId === '' ? null : values.entityId;
  return {
    description: values.description,
    account: accountName,
    accountId: values.accountId,
    amount: Number(values.amount),
    date: values.date,
    type: values.type,
    tags: values.tags,
    entityId,
    entityName: entityId ? entityName : null,
    notes: values.notes === '' ? null : values.notes,
  };
}

interface SubmitDeps {
  editingTransaction: Transaction | null;
  createMutation: Pick<ReturnType<typeof useTransactionMutations>['createMutation'], 'mutate'>;
  updateMutation: Pick<ReturnType<typeof useTransactionMutations>['updateMutation'], 'mutate'>;
  resolveEntityName: (entityId: string) => string | null;
  resolveAccountName: (accountId: string) => string | null;
}

export function buildSubmit(deps: SubmitDeps) {
  return (values: TransactionFormValues) => {
    const entityName = values.entityId === '' ? null : deps.resolveEntityName(values.entityId);
    // Falls back to the transaction's existing display name rather than a
    // blank string when the accounts list hasn't resolved this id yet — the
    // account picker only lets you choose an id that's already loaded, so an
    // unresolvable id here means the accounts query is still in flight, not
    // that the account has no name.
    const accountName =
      deps.resolveAccountName(values.accountId) ?? deps.editingTransaction?.account ?? '';
    const payload = buildTransactionPayload({ values, entityName, accountName });
    if (deps.editingTransaction) {
      deps.updateMutation.mutate({ id: deps.editingTransaction.id, data: payload });
    } else {
      deps.createMutation.mutate(payload);
    }
  };
}

/** Map an existing transaction to form values for the edit dialog. */
function transactionToFormValues(t: Transaction): TransactionFormValues {
  return {
    date: t.date,
    amount: String(t.amount),
    description: t.description,
    accountId: t.accountId,
    type: t.type || 'purchase',
    entityId: t.entityId ?? '',
    tags: t.tags,
    notes: t.notes ?? '',
  };
}

interface DialogHandlersDeps {
  form: ReturnType<typeof useForm<TransactionFormValues>>;
  setEditingTransaction: (t: Transaction | null) => void;
  setIsDialogOpen: (v: boolean) => void;
}

function useDialogHandlers(deps: DialogHandlersDeps) {
  const { form, setEditingTransaction, setIsDialogOpen } = deps;
  const handleAdd = useCallback(() => {
    setEditingTransaction(null);
    form.reset({
      ...DEFAULT_TRANSACTION_VALUES,
      // Default to today (YYYY-MM-DD slice). Local date so the user sees today.
      date: new Date().toISOString().slice(0, 10),
    });
    setIsDialogOpen(true);
  }, [form, setEditingTransaction, setIsDialogOpen]);

  const handleEdit = useCallback(
    (transaction: Transaction) => {
      setEditingTransaction(transaction);
      form.reset(transactionToFormValues(transaction));
      setIsDialogOpen(true);
    },
    [form, setEditingTransaction, setIsDialogOpen]
  );
  return { handleAdd, handleEdit };
}

interface ResolversDeps {
  entitiesQuery: ReturnType<typeof useAllEntities>;
  accountsQuery: ReturnType<typeof useAllAccounts>;
}

function useNameResolvers({ entitiesQuery, accountsQuery }: ResolversDeps) {
  const resolveEntityName = useCallback(
    (entityId: string): string | null => {
      const entity = entitiesQuery.data?.data.find((e) => e.id === entityId);
      return entity?.name ?? null;
    },
    [entitiesQuery.data]
  );

  const resolveAccountName = useCallback(
    (accountId: string): string | null => {
      const account = accountsQuery.accounts?.find((a) => a.id === accountId);
      return account?.name ?? null;
    },
    [accountsQuery.accounts]
  );

  return { resolveEntityName, resolveAccountName };
}

function useTransactionsPageQueries() {
  const query = useQuery({
    queryKey: ['finance', 'transactions', 'list', 'all'],
    queryFn: async () =>
      fetchAllPages(async (page) => unwrap(await transactionsList({ query: page }))),
  });
  const { data: availableTagsData } = useQuery({
    queryKey: ['finance', 'transactions', 'availableTags'],
    queryFn: async () => unwrap(await transactionsAvailableTags()),
  });
  const entitiesQuery = useAllEntities();
  const accountsQuery = useAllAccounts();
  return { query, availableTags: availableTagsData?.tags ?? [], entitiesQuery, accountsQuery };
}

export function useTransactionsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const { query, availableTags, entitiesQuery, accountsQuery } = useTransactionsPageQueries();

  const { createMutation, updateMutation, deleteMutation, confirmDelete, confirmUnlink } =
    useTransactionMutations({
      setIsDialogOpen,
      setEditingTransaction,
      setDeletingTx,
    });

  const form = useForm<TransactionFormValues>({
    resolver: standardSchemaResolver(TransactionFormSchema),
    defaultValues: DEFAULT_TRANSACTION_VALUES,
  });

  const { handleAdd, handleEdit } = useDialogHandlers({
    form,
    setEditingTransaction,
    setIsDialogOpen,
  });

  const { resolveEntityName, resolveAccountName } = useNameResolvers({
    entitiesQuery,
    accountsQuery,
  });

  const onSubmit = buildSubmit({
    editingTransaction,
    createMutation,
    updateMutation,
    resolveEntityName,
    resolveAccountName,
  });

  return {
    query,
    availableTags,
    entities: entitiesQuery.data?.data ?? [],
    accounts: accountsQuery.accounts ?? [],
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingTransaction,
    deletingTx,
    setDeletingTx,
    deleteMutation,
    confirmDelete,
    confirmUnlink,
    handleAdd,
    handleEdit,
    onSubmit,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
