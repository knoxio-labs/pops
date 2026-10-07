/**
 * Save-time paired-transfer attempt (POPS-5868): a `transfer` typed by hand
 * links to its counterpart as soon as it is saved when that row already
 * exists, instead of waiting for the next import or the daily sweep.
 */
import { transactionsService, type FinanceDb, type TransactionRow } from '../../../db/index.js';
import { attemptPairForRow } from './pair-runner.js';
import { getTransferPairWindowDays, isTransferPairEnabled } from './pair-transfers.js';

/**
 * Try to pair a row that was just created or updated, and return the row as it
 * stands afterwards so its `relatedTransactionId` reflects a new link.
 *
 * Only a `transfer` row is attempted, and only while
 * `FINANCE_TRANSFER_PAIR_ENABLED` is on. An ambiguous or missing counterpart
 * leaves the row unpaired for the sweep or the next import to retry.
 *
 * Never throws: pairing is enrichment of a save that has already been written,
 * so a failure is logged and the saved row returned as it was.
 */
export function pairSavedTransfer(db: FinanceDb, row: TransactionRow): TransactionRow {
  if (row.type !== 'transfer' || !isTransferPairEnabled()) return row;
  try {
    if (attemptPairForRow(db, row, getTransferPairWindowDays()) !== 'linked') return row;
    return transactionsService.getTransaction(db, row.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Transactions] Transfer pairing failed for ${row.id}: ${message}`);
    return row;
  }
}
