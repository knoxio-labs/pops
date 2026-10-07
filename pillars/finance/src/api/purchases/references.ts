/**
 * The pins finance holds in the purchases receipt store on behalf of a
 * transaction (POPS-5870). A pinned file survives the store's retention sweep.
 */
import { type PurchasesReceiptsClient } from './client.js';

/** The `pops://` URI purchases files a transaction's pins under. */
export function transactionOwnerUri(transactionId: string): string {
  return `pops://finance/transaction/${transactionId}`;
}

/**
 * Release a transaction's pins after its row, or its attachment row, is
 * already gone: the named files, or every file when none are named.
 *
 * Never throws. A failure is logged, because the write it follows has
 * happened, and a pin left behind keeps a file, it does not lose one.
 */
export async function releaseReceiptReferences(
  purchases: PurchasesReceiptsClient,
  transactionId: string,
  receiptUris?: string[]
): Promise<void> {
  try {
    await purchases.removeReferences(transactionOwnerUri(transactionId), receiptUris);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown failure';
    console.error(
      `[finance-api] could not release the receipt references of transaction ` +
        `'${transactionId}'; the files stay stored. ${detail}`
    );
  }
}
