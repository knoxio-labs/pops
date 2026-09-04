import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { unwrap } from '../finance-api-helpers.js';
import { transactionsSuggestTags, transactionsUpdate } from '../finance-api/index.js';
import { buildColumns, buildTransactionFilters, type Transaction } from './transactions/columns';
import { DeleteTransactionDialog } from './transactions/DeleteTransactionDialog';
import { PurchaseDetailDialog } from './transactions/purchase-detail/PurchaseDetailDialog';
import { usePurchaseLinkSummaries } from './transactions/purchase-link/usePurchaseLinkSummaries';
import { TransactionFormDialog } from './transactions/TransactionFormDialog';
import { useTransactionsPage } from './transactions/useTransactionsPage';

import type { TFunction } from 'i18next';

import type { AccountOption } from '@pops/ui';

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('finance');
  return (
    <div className="space-y-6">
      <PageHeader title={t('transactions')} />
      <Alert variant="destructive">
        <p className="font-semibold">{t('transactions.failedToLoad')}</p>
        <p className="text-sm">{message}</p>
        <Button variant="link" size="sm" onClick={onRetry} className="mt-2 px-0">
          {t('common:tryAgain')}
        </Button>
      </Alert>
    </div>
  );
}

function TableContent({
  isLoading,
  transactions,
  columns,
  accounts,
  onFilteredCountChange,
}: {
  isLoading: boolean;
  transactions: Transaction[] | undefined;
  columns: ReturnType<typeof buildColumns>;
  accounts: AccountOption[];
  onFilteredCountChange: (count: number) => void;
}) {
  const { t } = useTranslation('finance');
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!transactions) return null;
  return (
    <DataTable
      columns={columns}
      data={transactions}
      searchable
      searchColumn="description"
      searchPlaceholder={t('transactions.searchPlaceholder')}
      paginated
      defaultPageSize={50}
      filters={buildTransactionFilters(t, accounts)}
      onFilteredCountChange={onFilteredCountChange}
    />
  );
}

function buildSubtitle(
  t: TFunction<'finance'>,
  total: number,
  filteredCount: number | null
): string {
  if (filteredCount !== null && filteredCount < total) {
    return t('transactions.filteredCount', { filtered: filteredCount, total });
  }
  return t('transactions.totalCount', { count: total });
}

function useSubtitle(t: TFunction<'finance'>, total: number | undefined) {
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const description = total !== undefined ? buildSubtitle(t, total, filteredCount) : undefined;
  return { description, setFilteredCount };
}

interface UpdateInput {
  id: string;
  data: { tags: string[] };
}

function useTagHandlers() {
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInput) =>
      unwrap(await transactionsUpdate({ path: { id: input.id }, body: input.data })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
  });
  const onTagSave = useCallback(
    (transactionId: string, _entityId: string | null, _description: string) =>
      async (tags: string[]) => {
        await updateMutation.mutateAsync({ id: transactionId, data: { tags } });
      },
    [updateMutation]
  );
  const onTagSuggest = useCallback(
    (description: string, entityId: string | null) => async () => {
      try {
        const result = unwrap(
          await transactionsSuggestTags({
            query: { description, ...(entityId !== null && { entityId }) },
          })
        );
        // The transactions table's tag cell offers bare suggestions with no
        // provenance UI, so the badge metadata the endpoint now carries is
        // dropped here rather than plumbed through the column.
        return result.tags.map((suggestion) => suggestion.tag);
      } catch {
        return [];
      }
    },
    []
  );
  return { onTagSave, onTagSuggest };
}

function useTransactionColumns(
  t: TFunction<'finance'>,
  state: ReturnType<typeof useTransactionsPage>,
  purchaseLinks: ReturnType<typeof usePurchaseLinkSummaries>,
  onShowPurchase: (t: Transaction | null) => void
) {
  const { onTagSave, onTagSuggest } = useTagHandlers();
  return buildColumns({
    t,
    availableTags: state.availableTags,
    accounts: state.accounts,
    purchaseLinks,
    onTagSave,
    onTagSuggest,
    onEdit: state.handleEdit,
    onDelete: state.setDeletingTx,
    onUnlink: state.confirmUnlink,
    onShowPurchase,
  });
}

export function TransactionsPage() {
  const { t } = useTranslation('finance');
  useSetPageContext({ page: 'transactions' });
  const state = useTransactionsPage();
  const { description, setFilteredCount } = useSubtitle(t, state.query.data?.pagination.total); // prettier-ignore
  const [purchaseTx, setPurchaseTx] = useState<Transaction | null>(null);
  const purchaseLinks = usePurchaseLinkSummaries(state.query.data?.data);
  const columns = useTransactionColumns(t, state, purchaseLinks, setPurchaseTx);

  if (state.query.error) {
    return <ErrorView message={state.query.error.message} onRetry={() => state.query.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('transactions')}
        description={description}
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            {t('transactions.addTransaction')}
          </Button>
        }
      />
      <TableContent
        isLoading={state.query.isLoading}
        transactions={state.query.data?.data}
        columns={columns}
        accounts={state.accounts}
        onFilteredCountChange={setFilteredCount}
      />
      <TransactionFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingTransaction={state.editingTransaction}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
        entities={state.entities}
        accounts={state.accounts}
      />
      <DeleteTransactionDialog
        deletingTx={state.deletingTx}
        setDeletingTx={state.setDeletingTx}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(tx) => state.confirmDelete(tx)}
      />
      <PurchaseDetailDialog transaction={purchaseTx} onClose={() => setPurchaseTx(null)} />
    </div>
  );
}
