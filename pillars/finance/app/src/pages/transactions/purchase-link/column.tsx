import { PurchaseLinkCell } from './PurchaseLinkCell';
import { PurchaseLinkHeader } from './PurchaseLinkHeader';

import type { ColumnDef } from '@tanstack/react-table';

import type { Transaction } from '../types';
import type { PurchaseLinkSummaries } from './usePurchaseLinkSummaries';

export interface PurchaseLinkColumnArgs {
  summaries: PurchaseLinkSummaries;
  onShowPurchase: (transaction: Transaction) => void;
}

/**
 * Lives beside the cell rather than in `columns.tsx` so the whole indicator —
 * its data shape, its states and its column — is one directory a reader can
 * open, and so the shared columns file grows by an import.
 *
 * Both halves take the whole `PurchaseLinkSummaries` apart here rather than
 * receiving a map and a flag separately, so a caller cannot hand over the
 * answers from one lookup and the reachability of another.
 */
export function buildPurchaseLinkColumn(args: PurchaseLinkColumnArgs): ColumnDef<Transaction> {
  return {
    id: 'purchase',
    header: () => <PurchaseLinkHeader unavailable={args.summaries.unavailable} />,
    enableSorting: false,
    cell: ({ row }) => (
      <PurchaseLinkCell
        summary={args.summaries.byTransactionId.get(row.original.id)}
        onOpen={() => args.onShowPurchase(row.original)}
      />
    ),
  };
}
