import { DeleteTransactionDialog } from './DeleteTransactionDialog';
import { PurchaseDetailDialog } from './purchase-detail/PurchaseDetailDialog';
import { TransactionFormDialog } from './TransactionFormDialog';
import { UnlinkTransferDialog } from './UnlinkTransferDialog';

import type { Transaction } from './types';
import type { useTransactionsPage } from './useTransactionsPage';

/** Every dialog `TransactionsPage` can open, gathered so the page's own JSX stays about the table. */
export function TransactionDialogs({
  state,
  purchaseTx,
  onClosePurchase,
}: {
  state: ReturnType<typeof useTransactionsPage>;
  purchaseTx: Transaction | null;
  onClosePurchase: () => void;
}) {
  return (
    <>
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
      <UnlinkTransferDialog
        unlinkingTx={state.unlinkingTx}
        setUnlinkingTx={state.setUnlinkingTx}
        isUnlinking={state.unlinkMutation.isPending}
        accounts={state.accounts}
        onConfirm={(tx) => state.confirmUnlink(tx)}
      />
      <PurchaseDetailDialog transaction={purchaseTx} onClose={onClosePurchase} />
    </>
  );
}
