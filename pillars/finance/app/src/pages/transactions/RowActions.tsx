import { Link2Off, MoreHorizontal, Pencil, Receipt, Trash2 } from 'lucide-react';

import { Button, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@pops/ui';

import type { TFunction } from 'i18next';

import type { Transaction } from './types';

export interface RowActionHandlers {
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onUnlink: (transaction: Transaction) => void;
  onShowPurchase: (transaction: Transaction) => void;
}

/** The per-row action menu. Unlinking only appears where there is a transfer to unlink. */
export function RowActions({
  transaction,
  t,
  handlers,
}: {
  transaction: Transaction;
  t: TFunction<'finance'>;
  handlers: RowActionHandlers;
}) {
  return (
    <div className="text-right">
      <DropdownMenu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
        align="end"
      >
        <DropdownMenuItem onClick={() => handlers.onEdit(transaction)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onShowPurchase(transaction)}>
          <Receipt /> {t('transactions.purchaseDetail.action')}
        </DropdownMenuItem>
        {transaction.relatedTransactionId ? (
          <DropdownMenuItem onClick={() => handlers.onUnlink(transaction)}>
            <Link2Off /> Unlink transfer
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => handlers.onDelete(transaction)}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}
