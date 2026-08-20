import { PurchaseLinkCell } from './PurchaseLinkCell';

import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';

import type { Transaction } from '../types';
import type { TransactionLinkSummary } from './types';

export interface PurchaseLinkColumnArgs {
  t: TFunction<'finance'>;
  summaries: Map<string, TransactionLinkSummary>;
  onShowPurchase: (transaction: Transaction) => void;
}

/**
 * Lives beside the cell rather than in `columns.tsx` so the whole indicator —
 * its data shape, its states and its column — is one directory a reader can
 * open, and so the shared columns file grows by an import.
 */
export function buildPurchaseLinkColumn(args: PurchaseLinkColumnArgs): ColumnDef<Transaction> {
  return {
    id: 'purchase',
    header: args.t('column.purchase'),
    enableSorting: false,
    cell: ({ row }) => (
      <PurchaseLinkCell
        summary={args.summaries.get(row.original.id)}
        onOpen={() => args.onShowPurchase(row.original)}
      />
    ),
  };
}
